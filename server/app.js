const express = require('express');
const fs = require('fs');
const path = require('path');
const hbs = require('hbs');
const MySQL = require('./utilsMySQL');

const app = express();
const port = 3000;

// Detectar si estem al Proxmox (si és pm2)
const isProxmox = !!process.env.PM2_HOME;

// Iniciar connexió MySQL
const db = new MySQL();
if (!isProxmox) {
  db.init({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'A-038012-o',
    database: 'sakila'
  });
} else {
  db.init({
    host: '127.0.0.1',
    port: 3306,
    user: 'super',
    password: '1234',
    database: 'sakila'
  });
}

// Static files
app.use(express.static('public'))
app.use(express.urlencoded({ extended: true }))

// Disable cache
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Handlebars
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

// Helpers
hbs.registerHelper('eq', (a, b) => a == b);
hbs.registerHelper('gt', (a, b) => a > b);

// Partials
hbs.registerPartials(path.join(__dirname, 'views', 'partials'));

// ---------- RUTAS ----------

// Página principal: 5 películas + 5 categorías
app.get('/', async (req, res) => {
  try {
    // 5 primeras películas con título, año, carátula y actores
    const moviesRows = await db.query(`
      SELECT f.film_id, f.title, f.release_year, 
             GROUP_CONCAT(CONCAT(a.first_name, ' ', a.last_name) SEPARATOR ', ') AS actors
      FROM film f
      LEFT JOIN film_actor fa ON fa.film_id = f.film_id
      LEFT JOIN actor a ON a.actor_id = fa.actor_id
      GROUP BY f.film_id
      ORDER BY f.film_id
      LIMIT 5
    `);

    // 5 primeras categorías
    const categoriesRows = await db.query(`
      SELECT category_id, name 
      FROM category 
      ORDER BY category_id 
      LIMIT 5
    `);

    // Convertir a JSON
    const movies = db.table_to_json(moviesRows, {
      film_id: 'number',
      title: 'string',
      release_year: 'number',
      actors: 'string'
    });

    const categories = db.table_to_json(categoriesRows, {
      category_id: 'number',
      name: 'string'
    });

    // Datos comunes
    const commonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data', 'common.json'), 'utf8')
    );

    res.render('index', {
      movies,
      categories,
      common: commonData
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Error consultant la base de dades');
  }
});

// Página de películas: 15 películas con actores
app.get('/movies', async (req, res) => {
  try {
    const moviesRows = await db.query(`
      SELECT f.film_id, f.title, f.description, f.release_year, f.rental_rate, f.length,
             GROUP_CONCAT(CONCAT(a.first_name, ' ', a.last_name) SEPARATOR ', ') AS actors
      FROM film f
      LEFT JOIN film_actor fa ON fa.film_id = f.film_id
      LEFT JOIN actor a ON a.actor_id = fa.actor_id
      GROUP BY f.film_id
      ORDER BY f.film_id
      LIMIT 15
    `);

    const movies = db.table_to_json(moviesRows, {
      film_id: 'number',
      title: 'string',
      description: 'string',
      release_year: 'number',
      rental_rate: 'number',
      length: 'number',
      actors: 'string'
    });

    const commonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data', 'common.json'), 'utf8')
    );

    res.render('movies', {
      movies,
      common: commonData
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Error consultant la base de dades');
  }
});

// Página de clientes: 25 primeros + 5 rentals cada uno
app.get('/customers', async (req, res) => {
  try {
    // 25 primeros clientes
    const customersRows = await db.query(`
      SELECT customer_id, first_name, last_name, email
      FROM customer
      ORDER BY customer_id
      LIMIT 25
    `);

    const customers = db.table_to_json(customersRows, {
      customer_id: 'number',
      first_name: 'string',
      last_name: 'string',
      email: 'string'
    });

    // Para cada cliente, obtener sus 5 últimos rentals
    for (let customer of customers) {
      const rentalsRows = await db.query(`
        SELECT r.rental_id, r.rental_date, f.title
        FROM rental r
        JOIN inventory i ON i.inventory_id = r.inventory_id
        JOIN film f ON f.film_id = i.film_id
        WHERE r.customer_id = ?
        ORDER BY r.rental_date DESC
        LIMIT 5
      `, [customer.customer_id]);

      customer.rentals = db.table_to_json(rentalsRows, {
        rental_id: 'number',
        rental_date: 'string',
        title: 'string'
      });
    }

    const commonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data', 'common.json'), 'utf8')
    );

    res.render('customers', {
      customers,
      common: commonData
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Error consultant la base de dades');
  }
});

// Iniciar servidor
const httpServer = app.listen(port, () => {
  console.log(`http://localhost:${port}`);
  console.log(`http://localhost:${port}/movies`);
  console.log(`http://localhost:${port}/customers`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await db.end();
  httpServer.close();
  process.exit(0);
});