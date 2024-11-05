const dotenv = require('dotenv');
dotenv.config();
const axios = require('axios');
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
});


/**
 * Retrieves ISO format dates of reviews for a given place from the database.
 * 
 * @param {string} placeId - The unique identifier for the place on Google Maps.
 * @returns {Promise<string[]>} - A promise that resolves to an array of ISO date strings from the database.
 * @throws Will throw an error if there is an issue querying the database.
 */
async function getReviewIsoDatesFromDb(placeId) {
  const client = await pool.connect();
  try {
    // Consulta SQL para buscar todas as datas ISO dos reviews no banco
    const result = await client.query('SELECT review_iso_date FROM reviews WHERE place_id = $1', [placeId]);
    return result.rows.map(row => row.review_iso_date); // Retorna apenas as datas ISO
  } catch (error) {
    console.error('Erro ao buscar datas de reviews:', error);
    throw error;
  } finally {
    await client.release();
  }
}

/**
 * Retrieves all reviews for a given place from the database, ordered by date in descending order.
 * 
 * @param {string} placeId - The unique identifier for the place on Google Maps.
 * @returns {Promise<Object[]>} - A promise that resolves to an array of review objects from the database.
 * @throws Will throw an error if there is an issue querying the database.
 */
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
    await client.release();
  }
}


/**
 * Fetches the latest reviews from the SerpApi for a given place and compares them with existing reviews in the database.
 * 
 * @param {string} placeId - The unique identifier for the place on Google Maps.
 * @param {Array} reviewsInDb - Array containing the existing reviews in the database for the specified place.
 * @returns {Promise<Object>} - A promise that resolves to an object containing success status, data about new reviews count, and a message indicating the result.
 * 
 * @throws Will return an error message if the SerpApi key is not configured correctly or is invalid.
 * 
 * The function checks for the number of reviews available from SerpApi and compares it with the count of reviews in the database.
 * If there are new reviews, it fetches them and updates the database, otherwise, it returns a message indicating no new reviews were found.
 */
async function fetchLatestReviewsFromSerpApi(placeId, reviewsInDb) {
  const serpApiKey = process.env.SERP_API_KEY;
  const baseUrl = process.env.SERP_BASE_URL;
  const params = {
    engine: 'google_maps_reviews',
    place_id: placeId,
    hl: 'en',
    sort_by: 'newestFirst',
    api_key: serpApiKey,
    no_cache: true
  };
  const httpResponse = await axios.get(baseUrl, { params }).then(response => response)
    .catch((error) => {
      return false
    });

  if (!httpResponse) {
    const oldReviews = {
      count: reviewsInDb.length,
      reviews: reviewsInDb
    };
    return {
      success: false,
      data: oldReviews,
      message: 'Para obter os reviews, verifique se o API Key do SERP API foi configurado corretamente ou esta válido.'
    };
  }
  const responseCount = Number(httpResponse.data.place_info.reviews);
  const reviewsInDbCount = Number(reviewsInDb);

  const newReviewsCount = responseCount - reviewsInDbCount;
  if (newReviewsCount !== 0) {
    const existingIsoDates = await getReviewIsoDatesFromDb(placeId);
    await fetchGoogleReviews(placeId, [ existingIsoDates ]);
    return {
      success: true,
      data: newReviewsCount,
      message: newReviewsCount +' Novos reviews encontrados.'
    };
  } 

  return {
    success: true,
    data: 0,
    message: 'Nenhum novo review encontrado.'
  };
}

/**
 * Fetches reviews from Google Maps for a given place ID.
 * The function will make requests to the SERP API until all reviews are fetched.
 * If there is an error while fetching reviews, the function will return the current reviews in the database.
 * @param {string} placeId - The place ID for which to fetch reviews.
 * @param {string[]} reviewsInDbIsoDates - An array of ISO dates of reviews already in the database.
 * @returns {Promise<{success: boolean, data: {count: number, list: Review[]}, message: string}>} - A promise that resolves to an object with a success flag, data and a message.
 */
async function fetchGoogleReviews(placeId, reviewsInDbIsoDates) {
  const serpApiKey = process.env.SERP_API_KEY;
  let reviews = [];
  let nextPageToken = null;
  const baseUrl = process.env.SERP_BASE_URL;
    do {
      const params = {
        engine: 'google_maps_reviews',
        place_id: placeId,
        hl: 'en',
        sort_by: 'newestFirst',
        api_key: serpApiKey,
        no_cache: true
      };

      if (nextPageToken) {
        params['next_page_token'] = nextPageToken;
      }

      const response = await axios.get(baseUrl, { params }).catch((error) => {
        return false
      });

      if (!response) {
        currentReviews = await getReviewsFromDb(placeId)
        const oldList = {
          count: currentReviews.length,
          list: currentReviews
        }
        return {
          success: false,
          data: oldList,
          message: 'Para obter os reviews mais atuais, verifique se o API Key do SERP API foi configurado corretamente ou esta válido.'
        };
      }

      console.log(`Received ${response.data.reviews.length} reviews`);
      const data = response.data;

      if (data.reviews) {
        reviews = [...reviews, ...data.reviews];
      }

      // Check if there is another page
      nextPageToken = data.serpapi_pagination?.next_page_token || null;
    } while (nextPageToken);

  return reviews;
}

/**
 * Saves an array of review objects to the PostgreSQL database for a specified place.
 *
 * @param {Array} reviews - An array of review objects to be saved in the database. Each review object should contain 
 *                          the user's name, rating, snippet, date, and ISO date.
 * @param {string} placeId - The unique identifier for the place on Google Maps to associate with the reviews.
 *
 * The function connects to the database and inserts each review into the 'reviews' table. It logs an error if any 
 * issues occur during the process and ensures the database connection is released back to the pool after completion.
 */
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

/**
 * Handles HTTP requests to scrape and save Google Map reviews for a given place based on the provided context.
 * 
 * It determines the place ID from the context and checks for existing reviews in the database. 
 * If no reviews exist or new reviews are available, it fetches them from the SerpApi, updates the database, 
 * and returns the list of saved reviews. Returns appropriate HTTP status codes and messages for different outcomes.
 * 
 * @param {Object} event - The event object containing request parameters.
 * @param {Object} event.pathParameters - The path parameters from the request.
 * @param {string} event.pathParameters.context - The context string to determine the place ID.
 * 
 * @returns {Promise<Object>} - A promise that resolves to an HTTP response object with a status code and message.
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
    // Buscar os reviews já armazenados no banco
    const existingReviews = await getReviewsFromDb(placeId);

    // Se não houver reviews no banco, busca novos reviews da API e salva no banco
    if (!existingReviews || existingReviews.length === 0) {
      // Buscar novos reviews da API
      const reviews = await fetchGoogleReviews(placeId);
      if (!reviews.success) {
        const lastReviewsList = {
          count: currentReviews.length,
          list: currentReviews
        }
        return {
          statusCode: 206,
          body: JSON.stringify({data: lastReviewsList, message: reviews.message,  }),
        };
      }
    }
    // Busca se existem novos reviews via API
    const newReviewsCount = await fetchLatestReviewsFromSerpApi(placeId, existingReviews);
    if (!newReviewsCount.success) {
      const lastReviewsList = {
        count: existingReviews.length,
        list: existingReviews
      }
      return {
        statusCode: 206,
        body: JSON.stringify({ data:lastReviewsList, message: newReviewsCount.message }),
      }
    }

    if (newReviewsCount.data === 0) {
      // Se nenhuma nova review foi encontrada, retorna os reviews existentes no banco
      return {
        statusCode: 200,
        data: existingReviews,
        body: JSON.stringify({ message: `Nenhum review novo encontrado. Exibindo ${existingReviews.length} reviews existentes no banco de dados.`, data: existingReviews }),
      };
    }
    
    // Se existirem reviews novos, comparar com os reviews existentes no banco e salvar apenas os novos
    const reviews = await fetchGoogleReviews(placeId);
    if (!reviews.success) {
      const lastReviewsList = {
        count: existingReviews.length,
        list: existingReviews
      }
      return {
        statusCode: 206,
        body: JSON.stringify({data: lastReviewsList, message: reviews.message }),
      }
    }

    const newReviewsToSave = reviews.data.filter(review => !existingReviews.some(
      existingReview => existingReview.review_iso_date === review.review_iso_date
    ));

    const newReviews = await saveReviewsToDB(newReviewsToSave, placeId, existingIsoDates);
    return {
      statusCode: 200,
      data: newReviews,
      body: JSON.stringify({ count: newReviews.length, data: newReviews, message: 'novos reviews capturados' }),
    };

  } catch (error) {
    console.error('Erro ao capturar e salvar reviews:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Erro ao capturar reviews', error }),
    };
  }
};
