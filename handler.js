const dotenv = require('dotenv');
dotenv.config();
const axios = require('axios');
const { Pool } = require('pg');

// Configuração do pool de conexões com o banco de dados PostgreSQL
const pool = new Pool({
  host: process.env.PG_HOST || 'dev-apiv2.cd4awvrpnf8t.us-east-1.rds.amazonaws.com', // Endereço do servidor PostgreSQL,
  user: process.env.PG_USER || 'dev',
  password: process.env.PG_PASSWORD || '%bKcPewQMR+a',
  database: process.env.PG_DATABASE || 'postgres',
  port: process.env.PG_PORT || 5432,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// function to get a Place ID from lat and long const { getJson } = require("serpapi");
/* getJson({
  api_key: "5f01c68cad4db434b2d07dce18757cd1ebe0fffc6c18e2e3b2c2ca095655141e",
  engine: "google_maps",
  type: "search",
  google_domain: "google.com",
  q: "Coffee",
  ll: "@-22.9841544,-43.2177256,17z",
  hl: "en"
}, (json) => {
  console.log(json);
}); */

async function getReviewCountFromDb(placeId) {
  // Conectar ao banco de dados
  const client = await pool.connect();
  try {

    // Consulta SQL para buscar o total de reviews existentes no banco
    const result = await client.query('SELECT COUNT(*) FROM reviews WHERE place_id = $1', [placeId]);

    // Obter o total de reviews
    const reviewCount = result.rows[0].count;
    return reviewCount;
  } catch (error) {
    console.error('Erro ao buscar reviews:', error);
    throw error;
  } finally {
    await client.end(); // Fechar a conexão com o banco
  }
}

async function fetchLatestReviewsFromSerpApi(placeId) {
  const serpApiKey = process.env.SERP_API_KEY || '5f01c68cad4db434b2d07dce18757cd1ebe0fffc6c18e2e3b2c2ca095655141e';
  const baseUrl = process.env.SERP_BASE_URL || 'https://serpapi.com/search.json';
  const params = {
    engine: 'google_maps_reviews',
    place_id: placeId,
    hl: 'en',
    sort_by: 'newestFirst',
    api_key: serpApiKey
  };

  try {
    const response = await axios.get(baseUrl, { params });
    return response.data.place_info.reviews;
  } catch (error) {
    console.error('Erro ao buscar reviews:', error);
    throw error;
  }

}

async function checkForNewReviews(placeId) {
  const reviewCount = await getReviewCountFromDb(placeId);
  const latestReviews = await fetchLatestReviewsFromSerpApi(placeId, reviewCount);

  if (latestReviews > reviewCount) {
    return latestReviews;
  }

  return null;
}

async function getReviewsFromDb(placeId) {
  const client = await pool.connect();
  try {

    // Consulta SQL para buscar os reviews existentes no banco
    const result = await client.query('SELECT * FROM reviews WHERE place_id = $1 ORDER BY review_iso_date DESC', [placeId]);
    return result.rows; // Retorna os reviews do banco de dados
  } catch (error) {
    console.error('Erro ao consultar reviews no banco de dados:', error);
    throw error;
  } finally {
    await client.end(); // Fechar a conexão com o banco
  }
}

async function fetchGoogleReviews(placeId) {
  const serpApiKey = process.env.SERP_API_KEY || '5f01c68cad4db434b2d07dce18757cd1ebe0fffc6c18e2e3b2c2ca095655141e';
  let reviews = [];
  let nextPageToken = null;
  const baseUrl = process.env.SERP_BASE_URL || 'https://serpapi.com/search.json';
  
  try {
    do {
      const params = {
        engine: 'google_maps_reviews',
        place_id: placeId,
        hl: 'en',
        sort_by: 'newestFirst',
        api_key: serpApiKey,
      };

      if (nextPageToken) {
        params['next_page_token'] = nextPageToken;
      }

      const response = await axios.get(baseUrl, { params });
      const data = response.data;

      if (data.reviews) {
        reviews = [...reviews, ...data.reviews];
      }

      // Check if there is another page
      nextPageToken = data.serpapi_pagination?.next_page_token || null;
    } while (nextPageToken);

    return reviews;

  } catch (error) {
    console.error('Error fetching reviews:', error);
    throw new Error('Failed to fetch reviews');
  }
}

// Função para armazenar reviews no banco de dados PostgreSQL
async function saveReviewsToDB(reviews, placeId) {
  const client = await pool.connect(); // Pega uma conexão do pool
  try {
    for (const review of reviews) {
      const query = `
        INSERT INTO reviews (author_name, rating, snippet, date, place_id, review_iso_date)
        VALUES ($1, $2, $3, $4, $5, $6)
      `;
      const values = [
        review?.user.name,
        review?.rating,
        review?.snippet,
        review?.date,  
        placeId,
        review?.iso_date
      ];

      await client.query(query, values);
    }
  } catch (error) {
    console.error('Erro ao salvar reviews no banco:', error);
  } finally {
    client.release(); // Libera a conexão de volta para o pool
  }
}

// Função principal que captura os reviews e salva no banco
module.exports.scrapeReviews = async (event) => {
  const placeId = 'ChIJhxTcDIrVmwARm0brYm21Hkw'; // Exemplo de ID de loja no Google Maps NEMA
  try {
    // Verifica se existem reviews no banco de dados
    const existingReviews = await getReviewsFromDb(placeId);
    if (existingReviews.length > 0) {
    // Verifica se existem novas reviews na API
      const newReviewsNumber = await checkForNewReviews(placeId);
      if (newReviewsNumber) {
  // Armazena as novas reviews no banco de dados
        const reviews = await fetchGoogleReviews(placeId, apiKey);
        await saveReviewsToDB(reviews, placeId);
        return {
          statusCode: 200,
          body: JSON.stringify({ message: `Reviews atualizadas com sucesso!`, data: newReviews }),
        };
      } else {
        const reviews = await getReviewsFromDb(placeId);
        return {
          statusCode: 200,
          body: JSON.stringify({ message: `Existem ${reviews.length} reviews no banco de dados.`, data: reviews }),
        };
      }
    }
    
    // Caso não existam reviews no banco de dados, Captura todos os reviews pertentes ao ID da loja;
    const reviews = await fetchGoogleReviews(placeId, apiKey);
    if (reviews.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Nenhuma review capturada!' }),
      };
    }

    // Armazena as reviews no banco de dados
    await saveReviewsToDB(reviews, placeId);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Salvos ${reviews.length} reviews com sucesso!`, data: reviews }),
    };
  } catch (error) {
    console.error('Erro ao capturar e salvar reviews:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Erro ao capturar reviews', error }),
    };
  }
};
