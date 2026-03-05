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
    password: 'A-038012-o', // La teva contrasenya local
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

// ---------- RUTES EXISTENTS (PRÀCTICA 302) ----------

// Pàgina principal: 5 pel·lícules + 5 categories
app.get('/', async (req, res) => {
  try {
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

    const categoriesRows = await db.query(`
      SELECT category_id, name 
      FROM category 
      ORDER BY category_id 
      LIMIT 5
    `);

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

// Pàgina de pel·lícules: 15 pel·lícules amb actors
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

// Pàgina de clients: 25 primers + 5 lloguers cada un
app.get('/customers', async (req, res) => {
  try {
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

// ---------- NOVES RUTES (PRÀCTICA 303) ----------

// Pàgina de detall d'una pel·lícula (GET /movie/:id)
app.get('/movie/:id', async (req, res) => {
  try {
    const filmId = req.params.id;

    const filmRows = await db.query(`
      SELECT film_id, title, description, release_year, rental_rate, length,
             (SELECT name FROM language WHERE language_id = film.language_id) AS language
      FROM film
      WHERE film_id = ?
    `, [filmId]);

    if (filmRows.length === 0) {
      return res.status(404).send('Pel·lícula no trobada');
    }

    const actorsRows = await db.query(`
      SELECT a.first_name, a.last_name
      FROM actor a
      JOIN film_actor fa ON a.actor_id = fa.actor_id
      WHERE fa.film_id = ?
      ORDER BY a.last_name, a.first_name
    `, [filmId]);

    const film = db.table_to_json(filmRows, {
      film_id: 'number',
      title: 'string',
      description: 'string',
      release_year: 'number',
      rental_rate: 'number',
      length: 'number',
      language: 'string'
    })[0];

    const actors = db.table_to_json(actorsRows, {
      first_name: 'string',
      last_name: 'string'
    });

    const commonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data', 'common.json'), 'utf8')
    );

    res.render('movie', {
      film,
      actors,
      common: commonData
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Error consultant la base de dades');
  }
});

// Formulari per afegir una nova pel·lícula (GET /movie/add)
app.get('/movie/add', async (req, res) => {
  try {
    // Necessitem la llista d'idiomes per al selector
    const languagesRows = await db.query('SELECT language_id, name FROM language ORDER BY name');
    const languages = db.table_to_json(languagesRows, { language_id: 'number', name: 'string' });

    const commonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data', 'common.json'), 'utf8')
    );

    res.render('movieAdd', {
      languages,
      common: commonData
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Error carregant el formulari');
  }
});

// Processar el formulari d'afegir pel·lícula (POST /movie/add)
app.post('/movie/add', async (req, res) => {
  try {
    const { title, description, release_year, rental_rate, length, language_id } = req.body;

    // Validació bàsica
    if (!title || !release_year || !rental_rate || !length || !language_id) {
      return res.status(400).send('Falten camps obligatoris');
    }

    // Inserir a la taula film
    const result = await db.query(`
      INSERT INTO film (title, description, release_year, rental_rate, length, language_id, last_update)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    `, [title, description, release_year, rental_rate, length, language_id]);

    // Redirigir a la llista de pel·lícules
    res.redirect('/movies');

  } catch (err) {
    console.error(err);
    res.status(500).send('Error en afegir la pel·lícula');
  }
});

// Formulari per editar una pel·lícula (GET /movie/edit/:id)
app.get('/movie/edit/:id', async (req, res) => {
  try {
    const filmId = req.params.id;

    // Obtenir dades de la pel·lícula
    const filmRows = await db.query(`
      SELECT film_id, title, description, release_year, rental_rate, length, language_id
      FROM film
      WHERE film_id = ?
    `, [filmId]);

    if (filmRows.length === 0) {
      return res.status(404).send('Pel·lícula no trobada');
    }

    const film = db.table_to_json(filmRows, {
      film_id: 'number',
      title: 'string',
      description: 'string',
      release_year: 'number',
      rental_rate: 'number',
      length: 'number',
      language_id: 'number'
    })[0];

    // Llista d'idiomes per al selector
    const languagesRows = await db.query('SELECT language_id, name FROM language ORDER BY name');
    const languages = db.table_to_json(languagesRows, { language_id: 'number', name: 'string' });

    const commonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data', 'common.json'), 'utf8')
    );

    res.render('movieEdit', {
      film,
      languages,
      common: commonData
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Error carregant el formulari d\'edició');
  }
});

// Processar l'edició d'una pel·lícula (POST /movie/edit/:id)
app.post('/movie/edit/:id', async (req, res) => {
  try {
    const filmId = req.params.id;
    const { title, description, release_year, rental_rate, length, language_id } = req.body;

    // Validació bàsica
    if (!title || !release_year || !rental_rate || !length || !language_id) {
      return res.status(400).send('Falten camps obligatoris');
    }

    // Actualitzar la taula film
    await db.query(`
      UPDATE film
      SET title = ?, description = ?, release_year = ?, rental_rate = ?, length = ?, language_id = ?, last_update = NOW()
      WHERE film_id = ?
    `, [title, description, release_year, rental_rate, length, language_id, filmId]);

    // Redirigir a la pàgina de detall de la pel·lícula
    res.redirect(`/movie/${filmId}`);

  } catch (err) {
    console.error(err);
    res.status(500).send('Error en editar la pel·lícula');
  }
});

// Eliminar una pel·lícula (POST /movie/delete/:id)
app.post('/movie/delete/:id', async (req, res) => {
  try {
    const filmId = req.params.id;

    // Eliminar dependències en ordre
    // 1. Eliminar de film_actor
    await db.query('DELETE FROM film_actor WHERE film_id = ?', [filmId]);

    // 2. Eliminar de film_category
    await db.query('DELETE FROM film_category WHERE film_id = ?', [filmId]);

    // 3. Eliminar de inventory i rental
    const inventories = await db.query('SELECT inventory_id FROM inventory WHERE film_id = ?', [filmId]);
    for (let inv of inventories) {
      await db.query('DELETE FROM rental WHERE inventory_id = ?', [inv.inventory_id]);
    }
    await db.query('DELETE FROM inventory WHERE film_id = ?', [filmId]);

    // 4. Finalment, eliminar la pel·lícula
    await db.query('DELETE FROM film WHERE film_id = ?', [filmId]);

    res.redirect('/movies');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error en esborrar la pel·lícula');
  }
});

// Iniciar servidor
const httpServer = app.listen(port, () => {
  console.log(`http://localhost:${port}`);
  console.log(`http://localhost:${port}/movies`);
  console.log(`http://localhost:${port}/customers`);
  console.log(`http://localhost:${port}/movie/add`); // Nova ruta
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await db.end();
  httpServer.close();
  process.exit(0);
});