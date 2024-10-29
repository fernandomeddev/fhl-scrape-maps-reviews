Dividir a execução da sua Lambda em etapas utilizando **AWS Step Functions**, o objetivo é orquestrar múltiplas execuções de forma sequencial ou paralela. Nesse caso, dividindo o processo de captura e armazenamento de reviews em três passos principais, usando funções Lambda para cada passo. Isso pode melhorar a escalabilidade, facilitar o tratamento de erros e otimizar o tempo de execução.

Exemplos:
### Estrutura Proposta:
1. **Passo 1**: Verificar se existem reviews no banco de dados.
2. **Passo 2**: Buscar novos reviews no SerpApi (caso seja necessário).
3. **Passo 3**: Armazenar os novos reviews no banco de dados (caso existam novos reviews).

### Diagrama de Exemplo (para visualização):
```
[Início] --> [Verificar Banco] --> [Buscar Novos Reviews] --> [Salvar no Banco] --> [Fim]
                             |                        |
                             | --> [Sem Novos Reviews] |
```

### 1. Definir as Lambdas
Três Lambdas separadas, cada uma representando um passo do fluxo.

#### Lambda 1: Verificar Banco de Dados (CheckReviewsInDb)
Esta Lambda vai verificar se já existem reviews no banco de dados para o `placeId`(de acordo com context).

```javascript
const { getReviewsFromDb } = require('./db');

module.exports.handler = async (event) => {
  const placeId = event.placeId;

  try {
    const reviews = await getReviewsFromDb(placeId);
    const reviewCount = reviews.length;

    return {
      statusCode: 200,
      body: JSON.stringify({
        reviewCount,
        placeId,
        hasReviews: reviewCount > 0
      }),
    };
  } catch (error) {
    console.error('Erro ao consultar reviews no banco de dados:', error);
    throw new Error('Failed to check reviews in DB');
  }
};
```

#### Lambda 2: Buscar Reviews no SerpApi (FetchReviewsFromSerpApi)
Essa Lambda vai fazer a consulta à API do SerpApi para ver para buscar a contagem de reviews para ver se teve alguma mudança para mais ou para menos, caso exitam reviews salvas no banco de dados.

```javascript
const { fetchGoogleReviews } = require('./serpapi');

module.exports.handler = async (event) => {
  const { placeId, reviewCount } = event; // Recebe do Step Function
  try {
    const reviews = await fetchGoogleReviews(placeId);
    return {
      statusCode: 200,
      body: JSON.stringify({ placeId, reviews, newReviewsCount: reviews.length }),
    };
  } catch (error) {
    console.error('Erro ao buscar reviews:', error);
    throw new Error('Failed to fetch reviews from SerpApi');
  }
};
```

#### Lambda 3: Salvar Reviews no Banco (SaveReviewsInDb)
Essa Lambda vai armazenar os reviews no banco de dados PostgreSQL.

```javascript
const { saveReviewsToDB } = require('./db');

module.exports.handler = async (event) => {
  const { placeId, reviews } = event; // Recebe do Step Function

  try {
    if (reviews.length > 0) {
      await saveReviewsToDB(reviews, placeId);
      return {
        statusCode: 200,
        body: JSON.stringify({ message: `Salvos ${reviews.length} reviews com sucesso!` }),
      };
    } else {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Nenhum review para salvar.' }),
      };
    }
  } catch (error) {
    console.error('Erro ao salvar reviews no banco:', error);
    throw new Error('Failed to save reviews to DB');
  }
};
```

### 2. Definir a Step Function (State Machine)

criar a State Machine no AWS Step Functions. Aqui está um exemplo de definição de estado em **Amazon States Language (ASL)** para orquestrar essas Lambdas.

### Explicação do JSON:
1. **CheckReviewsInDb**: Primeira tarefa que consulta o banco de dados para ver se já existem reviews.
2. **HasReviews?**: Uma escolha condicional. Se já existem reviews, vai buscar os reviews mais recentes na SerpApi.
3. **FetchReviewsFromSerpApi**: Se existem novos reviews ou se não há reviews no banco, busca as reviews na SerpApi.
4. **SaveReviewsInDb**: Salva os reviews no banco de dados.

### 3. Deploy e Configurações na AWS
1. **Criar as Lambdas**: cada uma das Lambdas mencionadas acima (CheckReviewsInDb, FetchReviewsFromSerpApi, SaveReviewsInDb) no AWS Lambda.

2. **Criar a State Machine**:
   - Crie uma nova **State Machine**.
   - Configurar as permissões adequadas para que as funções Lambda possam ser chamadas.

### 4. Configuração de Timeout e Erros
- **Timeouts**: Cada Lambda deverá ter seu próprio timeout configurado, configurar tambem o timeout em cada etapa da State Machine.
- **Retry e Catch**: No Step Functions, adicionar blocos de `Retry` e `Catch` para tratamento de erros em cada estado.

### Conclusão
Com essa abordagem, dividimos a lógica em funções menores e escaláveis. Isso permite:
- Melhor controle sobre os tempos de execução, já que Step Functions pode orquestrar tarefas que podem demorar mais que 30 segundos.
- Recuperação automática de falhas (retry) e uma visão clara de onde e como os erros acontecem no processo.
- Flexibilidade e reuso, pois as Lambdas estão desacopladas e podem ser ajustadas de forma independente.

Essa arquitetura torna o sistema mais robusto, modular e fácil de manter.