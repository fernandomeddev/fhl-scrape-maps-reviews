###Alternativas para Construção de um Projeto de Captura de Dados do Google Reviews

#### 1. **Utilização do SerpApi para Captura de Dados do Google Reviews**
O **SerpApi** é uma API específica para scraping de dados de mecanismos de busca, incluindo avaliações de negócios no Google Maps. A API já lida com a complexidade de scraping, fornecendo uma interface estruturada e otimizada para a extração de dados.

##### **Prós**:
   - **Facilidade de uso**: O SerpApi já é configurado para realizar scraping em buscas do Google, oferecendo endpoints otimizados para capturar avaliações de lojas.
   - **Menor complexidade**: Não é necessário lidar com detalhes de scraping manual como proxies, captchas, e mudanças de layout.
   - **Bom controle de custos**: Comparado à API oficial do Google, pode ser mais barato dependendo do volume e necessidades de uso.
   - **Escalabilidade**: Fácil de escalar e integrar com funções serverless, como AWS Lambda.
   - **Documentação clara** e suporte técnico ágil.

##### **Contras**:
   - **API paga**: Assim como a API do Google, o SerpApi cobra por requisição, o que pode aumentar conforme o volume de dados.
   - **Limitações de uso**: Há limites diários de requisições e, dependendo do plano, o acesso a dados pode ser restringido.
   - **Dependência de terceiros**: A API está sujeita a mudanças externas que podem impactar o fluxo de trabalho.
   
##### **Caminho para Implementação**:
   - Criar uma conta no SerpApi e obter uma chave de API.
   - Configurar a função Lambda utilizando o Serverless Framework para orquestrar a captura dos dados via SerpApi.
   - Construir chamadas para capturar as avaliações e comentários das lojas.
   - Armazenar os dados em um banco de dados relacional (Postgres).
   - Configurar logs e monitoramento da função para garantir performance e capturar possíveis erros.

#### 2. **Utilização da API oficial do Google Places**
   A **Google Places API** permite a captura de informações diretamente de suas bases de dados, incluindo avaliações de lojas.

   **Prós**:
   - Acesso confiável e direto às avaliações.
   - Atualizações frequentes com dados oficiais do Google.
   - Suporte à integração com serviços de autenticação OAuth2 para maior segurança.
   
   **Contras**:
   - Custo por uso, dependendo do volume de chamadas e dados extraídos.
   - Limitações de cota e restrições de dados por chamadas.
   - Não permite acesso a todas as informações (por exemplo, comentários extensos podem ser truncados).

   **Caminho para Implementação**:
   - Configurar um projeto no Google Cloud e ativar a Google Places API.
   - Utilizar credenciais OAuth2 para autenticar a aplicação.
   - Construir uma função Lambda utilizando o Serverless Framework para chamar a API, processar as avaliações e armazená-las no banco Postgres.

#### 3. **Web Scraping Manual (Puppeteer ou Playwright)**
   Web scraping envolve automatizar a coleta de dados diretamente das páginas do Google Maps.

   **Prós**:
   - Pode capturar informações mais detalhadas e flexíveis, não limitadas pela API oficial.
   - Não possui custos diretos, exceto por infraestrutura de hospedagem.

   **Contras**:
   - Risco de ser bloqueado ou banido pelo Google.
   - Mais complexo de implementar e manter, já que mudanças no layout da página podem quebrar o scraper.
   - Pode ser menos eficiente em termos de tempo de resposta.

   **Caminho para Implementação**:
   - Usar uma biblioteca como Puppeteer ou Playwright para automatizar a navegação e extração de dados do Google Maps.
   - Configurar proxies e resolver captchas para evitar bloqueios.
   - Processar e armazenar as avaliações no banco de dados Postgres.

---

### Escolha da Melhor Alternativa

A **utilização do SerpApi** se apresenta como a melhor alternativa para este projeto devido aos seguintes fatores:
- **Facilidade e agilidade na implementação**, já que a API oferece endpoints prontos para captura de reviews.
- **Escalabilidade e menor manutenção** em comparação com web scraping manual.
- **Custo controlado** em comparação com a API oficial do Google.
- **Conformidade e confiabilidade**, já que o SerpApi lida com os desafios de scraping de maneira estruturada.

### Teste Funcional

**1. Configuração Inicial**:
- Criar uma conta no SerpApi e obter a chave de API.
- Configurar um projeto no Serverless Framework para hospedar a função Lambda.

**2. Implementação**:
- Construir uma função Lambda em Node.js que:
  - Consome o SerpApi para capturar as avaliações de uma loja específica no Google Maps.
  - Armazena os dados capturados em um banco de dados relacional Postgres (nome do usuário, avaliação, texto da review, data).

**3. Teste Funcional**:
- Subir a função Lambda e realizar um teste capturando as reviews de uma loja específica.
- Verificar no banco de dados Postgres se as informações foram inseridas corretamente.

### Conclusão
A **utilização do SerpApi** foi escolhida pela sua simplicidade, menor manutenção, e escalabilidade. O teste funcional garantiu a captura correta de dados de uma loja, atendendo aos requisitos do projeto.
