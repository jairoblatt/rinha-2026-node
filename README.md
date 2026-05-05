# Rinha 2026 Node

Solução em Node.js a [Rinha de Backend 2026](https://github.com/zanfranceschi/rinha-de-backend-2026) - detecção de fraude por busca vetorial kNN em 3 milhões de vetores, rodando em **1 CPU / 350 MB** distribuídos entre duas instâncias de API e um load balancer.

---

## O problema

A competição avalia latência (p99) e qualidade de detecção. Com apenas 1 CPU total e 350 MB de RAM, qualquer alocação desnecessária é inimiga dupla: consome memória **e** força o Garbage Collector a rodar, adicionando pausas imprevisíveis ao p99.

A estratégia central é: **não alocar nada no hot path**. Todos os objetos que precisam existir são criados uma única vez no startup e reutilizados em cada requisição.

---

## Arquitetura

```
Cliente → load balancer (Unix socket) → api1.sock
                                      → api2.sock
```

As instâncias de API não se comunicam por TCP — usam **Unix domain sockets**, que eliminam o overhead da stack de rede.

---

## Camadas da solução

### 1. Servidor HTTP: `uWebSockets.js`

```ts
uWS.App()
  .post("/fraud-score", (res) => handleFraud(res))
  .listen_unix(token => { ... }, sockPath);
```

`uWebSockets.js` é um binding C++ sobre a lib `uWS`. É o servidor HTTP mais rápido disponível para Node.js, com throughput medido em centenas de milhares de requisições por segundo. Diferente do `http` nativo ou do Fastify, ele não cria objetos JS por requisição — o `res` é apenas um ponteiro para o contexto C++.

Dois detalhes críticos de uso:

- **`res.onAborted(() => {})`**: obrigatório em toda rota que não responde imediatamente. Sem ele, o uWS trava ao descartar conexões abortadas.
- **`res.cork()`**: agrupa todos os `writeHeader` + `end` em um único `writev` no kernel, reduzindo o número de syscalls para enviar a resposta.

### 2. Parser JSON zero-alocação

```ts
// módulo-level — criados uma vez, reutilizados para sempre
let p = 0;
let buf: Buffer = Buffer.alloc(0);
const merchantStarts = new Int32Array(16);
const merchantEnds   = new Int32Array(16);
const iso            = new Int16Array(5);
const payload: Payload = { amount: 0, ... };
```

O parser em `src/parse.ts` não usa `JSON.parse`. Em vez disso, lê bytes diretamente do `Buffer` recebido pelo uWS, avançando um cursor inteiro `p` ao longo do conteúdo.

**Por que não `JSON.parse`?**

`JSON.parse` cria um objeto JS com todas as chaves e valores como strings/números novos na heap. Isso significa dezenas de alocações por requisição, todas elegíveis para GC. O parser manual:

- Reutiliza o objeto `payload` singleton — **zero alocações de objetos**
- Nunca cria strings intermediárias — `mcc`, `merchant_id`, datas e booleanos são lidos diretamente dos bytes
- Compara `merchant_id` com o histórico de merchants byte a byte no buffer original, sem criar nenhuma string

```ts
// comparação de strings sem criar strings
for (let i = 0; i < mc; i++) {
  if (sLen !== midLen) continue;
  for (let j = 0; j < sLen; j++) {
    if (buf[merchantStarts[i] + j] !== buf[midStart + j]) { ... }
  }
}
```

### 3. Vetorização: Float32Array estático

```ts
const vec = new Float32Array(14); // criado uma vez

export function vectorize(p: Payload): Float32Array {
  vec[0] = ...; vec[1] = ...; // escreve nos slots existentes
  return vec;
}
```

O vetor de 14 dimensões é um `Float32Array` de módulo. `vectorize` sobrescreve os valores e retorna a mesma referência — nenhum array novo é criado. O chamador usa o vetor antes da próxima requisição sobrescrever, o que é seguro porque o uWS é single-threaded por worker.

### 4. Respostas pré-computadas

```ts
export const FRAUD_BODY_0 = Buffer.from('{"approved":true,"fraud_score":0.0}');
export const FRAUD_BODY_1 = Buffer.from('{"approved":true,"fraud_score":0.2}');
// ...
```

O `fraud_score` só pode ser `0/5, 1/5, 2/5, 3/5, 4/5, 5/5` — exatamente 6 valores possíveis. Os 6 corpos de resposta são `Buffer`s criados no módulo load, e o handler só indexa o array:

```ts
res.cork(() => {
  res.writeHeader(CONTENT_TYPE_KEY, CONTENT_TYPE_JSON).end(FRAUD_BODIES[score]);
});
```

Nenhuma interpolação de string, nenhum `JSON.stringify`, nenhuma alocação.

### 5. KNN em Rust nativo (NAPI)

O gargalo real da solução é buscar os 5 vizinhos mais próximos em 3 milhões de vetores. Isso é feito em Rust compilado como addon nativo (`.node`), carregado via `createRequire`.

**Por que não JS/WASM?**

- JS não tem acesso a intrinsics SIMD de baixo nível (AVX2/FMA)
- WASM tem overhead de boundary e não acessa `_mm256_fmadd_ps` diretamente
- Rust compila para o mesmo código de máquina que C, com segurança de memória em tempo de compilação

**Passagem de argumentos**: os 14 floats são passados como argumentos escalares individuais em vez de um array ou TypedArray. Isso evita a criação de qualquer objeto no boundary NAPI:

```ts
knnFraudCount(vec[0], vec[1], vec[2], ..., vec[13])
```

### 6. Índice IVF (Inverted File Index)

Busca bruta em 3M vetores por requisição seria inviável. O dataset é pré-organizado em um **índice IVF**: os vetores são agrupados em clusters (centroids), e a busca tem dois estágios:

1. **Busca de centroids** — encontra os `k` centroids mais próximos do query (`FAST_NPROBE=5`)
2. **Scan refinado** — varre apenas os vetores nos clusters selecionados

Se o resultado for "borderline" (2 ou 3 dos 5 vizinhos são fraude — a zona de incerteza da decisão `< 0.6`), expande para `FULL_NPROBE=24` clusters para mais precisão, sem penalizar os casos óbvios.

### 7. SIMD AVX2/FMA

```rust
#[target_feature(enable = "avx2,fma")]
unsafe fn compute_centroid_dists(...) {
    let d0 = _mm256_sub_ps(_mm256_loadu_ps(cp.add(ci)), qd);
    _mm256_storeu_ps(dp.add(ci), _mm256_fmadd_ps(d0, d0, a0));
}
```

AVX2 processa **8 floats simultaneamente** em um único ciclo de CPU. `_mm256_fmadd_ps` faz `a + b*c` em uma instrução (fused multiply-add), sem arredondamento intermediário. Isso reduz os ~4096 centroids × 14 dimensões a poucos microssegundos.

### 8. Quantização i16 e alinhamento de memória

Os 3M vetores são armazenados como `i16` (inteiros de 16 bits) com fator de escala `0.0001`, em vez de `f32` (32 bits). Isso reduz o tamanho do dataset pela metade (~84 MB em vez de ~168 MB), cabendo dentro do limite de memória da competição.

As estruturas de dados usam `AVec<_, ConstAlign<32>>` — vetores com alinhamento garantido de 32 bytes, necessário para que os loads AVX2 operem na máxima eficiência possível:

```rust
pub struct Dataset {
    pub centroids: AVec<f32, ConstAlign<32>>,
    pub blocks:    AVec<i16, ConstAlign<32>>,
    ...
}
```

### 9. Índice embutido no binário

```rust
static INDEX_GZ: &[u8] = include_bytes!("../data/index.bin.gz");
```

O arquivo `index.bin.gz` é embutido no binário Rust em tempo de compilação. No startup, é descomprimido uma única vez para a `OnceLock<Dataset>`. Zero I/O em disco em runtime, zero abertura de arquivo por requisição.

### 10. Early exit no scan

```rust
// calcula 8 das 14 dimensões primeiro
let partial = _mm256_add_ps(acc0, acc1);
if _mm256_movemask_ps(_mm256_cmp_ps(partial, threshold, _CMP_LT_OQ)) == 0 {
    continue 'block; // já é pior que o 5º vizinho atual — descarta
}
// só continua para as 6 dimensões restantes se ainda houver chance
```

Se a distância parcial (calculada com as primeiras 8 dimensões) já for maior que o pior dos 5 melhores encontrados até agora, o candidato é descartado sem calcular as 6 dimensões restantes. Na prática, elimina a grande maioria dos vetores do scan.

### 11. Prefetch de cache L1

```rust
_mm_prefetch(blocks_ptr.add(prefetch_block * 112) as *const i8, _MM_HINT_T0);
```

8 blocos à frente do bloco atual, `PREFETCHT0` solicita ao prefetcher da CPU que carregue os dados no cache L1 antes de serem necessários. Elimina cache misses durante o scan sequencial dos vetores.

### 12. Warmup no startup

```rust
pub fn warmup() {
    for _ in 0..500 {
        let mut q = [0.0f32; 14];
        // preenche q com valores pseudo-aleatórios
        let _ = knn5_fraud_count(&q, ds);
    }
}
```

500 queries dummy no startup garantem que:

- Os dados do dataset estão nos caches de CPU
- O branch predictor já aprendeu os padrões dos loops de scan
- Nenhuma "cold start latency" aparece nas primeiras requisições reais

---

## Resumo das decisões

| Problema                 | Solução                                                                  |
| ------------------------ | ------------------------------------------------------------------------ |
| Alocações por requisição | Singletons de módulo para `payload`, `vec`, headers e corpos de resposta |
| Pressão no GC            | Zero strings criadas no parser; sem `JSON.parse`; sem `JSON.stringify`   |
| Latência de KNN          | Índice IVF em Rust + AVX2 SIMD + quantização i16                         |
| Overhead de rede         | Unix sockets entre LB e API                                              |
| I/O de disco             | Dataset embutido no binário, descomprimido uma vez                       |
| Cold start               | Warmup de 500 queries no `initKnn()`                                     |
| Throughput HTTP          | `uWebSockets.js` (C++) + `res.cork()`                                    |
