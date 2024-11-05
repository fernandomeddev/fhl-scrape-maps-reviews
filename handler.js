const dotenv = require('dotenv');
const puppeteer = require('puppeteer');
dotenv.config();
const { Pool } = require('pg');

// Configuração do pool de conexões com o banco de dados PostgreSQL
const pool = new Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port: process.env.PG_PORT || 5432,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  pg_data_table: process.env.PG_DATA_TABLE,
});

/**
 * Função de scraping usando Puppeteer para buscar reviews do Google Maps
 * 
 * @param {string} placeId - O identificador único do local no Google Maps.
 * @returns {Promise<Array>} - Lista de reviews capturados do Google Maps.
 */
async function scrapeGoogleReviews(placeId) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const url = `https://www.google.com/maps/place/?q=place_id:${placeId}`;
  
  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.section-review');

  let reviews = [];

  // Scroll para carregar mais reviews, se houver
  let loadMoreButton = await page.$('.section-loading-button');
  while (loadMoreButton) {
    await loadMoreButton.click();
    await page.waitForTimeout(2000);
    loadMoreButton = await page.$('.section-loading-button');
  }

  // Extrai informações de reviews na página
  reviews = await page.evaluate(() => {
    const reviewElements = document.querySelectorAll('.section-review-content');
    return Array.from(reviewElements).map(review => ({
      review_id: review.querySelector('a').getAttribute('href').split('/').pop(),
      author_name: review.querySelector('.section-review-title span').innerText,
      rating: parseFloat(review.querySelector('.section-review-stars').getAttribute('aria-label')),
      text: review.querySelector('.section-review-text').innerText,
      time: review.querySelector('.section-review-publish-date').innerText,
    }));
  });

  await browser.close();
  return reviews;
}

/**
 * Função para salvar reviews no banco de dados sem duplicar.
 *
 * @param {Array} reviews - Lista de objetos de reviews.
 * @param {string} placeId - Identificador único do local no Google Maps.
 */
async function saveReviewsToDb(reviews, placeId) {
  const client = await pool.connect();
  try {
    const insertQuery = `
      INSERT INTO reviews_2 (review_id, place_id, author_name, rating, text, time, created_at)
      VALUES ($1, $2, $3, $4, $5, to_timestamp($6), NOW())
      ON CONFLICT (review_id) DO NOTHING
    `;

    for (const review of reviews) {
      const { review_id, author_name, rating, text, time } = review;
      const res = await client.query('SELECT 1 FROM reviews WHERE review_id = $1', [review_id]);
      if (res.rowCount === 0) {
        await client.query(insertQuery, [review_id, placeId, author_name, rating, text, time]);
        console.log(`Review ${review_id} inserido com sucesso.`);
      } else {
        console.log(`Review ${review_id} já existe. Ignorando.`);
      }
    }
  } catch (error) {
    console.error('Erro ao inserir reviews no banco de dados:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Função principal da Lambda para manipular o scraping e a inserção dos dados.
 */
module.exports.scrapeReviews = async (event) => {
  const { context } = event.pathParameters;
  if (!context) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'context na URL é obrigatório' }),
    };
  }

  let placeId;
  switch (context) {
    case 'nema_humaita':
      placeId = 'ChIJizElztN_mQARyfLk7REGZRc';
      break;
    case 'nema_visconde_de_piraja':
      placeId = 'ChIJhxTcDIrVmwARm0brYm21Hkw';
      break;
    case 'nema_leblon':
      placeId = 'ChIJF8dM_x_VmwARHGUmlUaKD5M';
      break;
    default:
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'context inválido' }),
      };
  }

  try {
    // Buscar reviews atuais no banco
  
    // Realizar scraping para buscar reviews
    const scrapedReviews = await scrapeGoogleReviews(placeId);
    if (scrapedReviews.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Nenhum novo review encontrado' }),
      };
    }

    // Salva novos reviews no banco
    await saveReviewsToDb(scrapedReviews, placeId);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: `${scrapedReviews.length} reviews capturados e armazenados` }),
    };
  } catch (error) {
    console.error('Erro ao capturar e salvar reviews:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Erro ao capturar reviews', error }),
    };
  }
};
