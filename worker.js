import {
  json,
  missing,
  error,
  withParams,
  withContent,
  ThrowableRouter,
} from 'itty-router-extras'

import { nanoid } from 'nanoid'

const router = ThrowableRouter({ stack: true })

// Sets router paths
router
  .get('/tasks/:email', withParams, ({ url, email }) => {
    url = new URL(url)

    // Check if email valid
    if (
      !email.match(
        /^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/,
      )
    ) {
      return Response.redirect(url.origin, 302)
    }

    // Fetch tasks html
    url.pathname = '/tasks.html'
    return fetch(url.href)
  })
  .get('/api/todos/:email', withParams, async ({ email }) => {
    // Get tasks from email
    const tasks = await TODOS.get(email, { type: 'json' })
    if (!tasks) {
      return missing('Email not found')
    }

    return json({ tasks })
  })
  .post(
    '/api/todos/:email',
    withContent,
    withParams,
    async ({ email, content }) => {
      // Check if required data present
      if (!content.task) {
        return error(400, 'Missing task')
      }

      // Check if valid email
      if (
        !email.match(
          /^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/,
        )
      ) {
        return error(400, 'Invalid email')
      }

      // Get existing tasks
      const tasks = (await TODOS.get(email, { type: 'json' })) || []

      // Create new task
      const task = {
        id: nanoid(),
        timestamp: Date.now(),
        task: content.task,
        completed: false,
      }

      // Add to existing tasks
      tasks.unshift(task)

      // Write to KV
      await TODOS.put(email, JSON.stringify(tasks))

      return json({ task })
    },
  )

  .patch(
    '/api/todos/:email/:id',
    withContent,
    withParams,
    async ({ email, id, content }) => {
      // Get tasks
      const tasks = await TODOS.get(email, { type: 'json' })
      if (!tasks) {
        missing('Email not found')
      }

      // Get task index
      const index = tasks.findIndex((task) => task.id === id)
      if (index === -1) {
        return missing('Task not found')
      }
      const task = tasks[index]

      // Update task
      if (content.task) {
        task.task = content.task
      }
      if (content.completed !== undefined) {
        task.completed = Boolean(content.completed)
      }
      tasks[index] = task

      // Update KV
      await TODOS.put(email, JSON.stringify(tasks))

      return json({ task })
    },
  )

  .delete('/api/todos/:email/:id', withParams, async ({ email, id }) => {
    // Get tasks
    const tasks = await TODOS.get(email, { type: 'json' })
    if (!tasks) {
      missing('Email not found')
    }

    // Get task index
    const index = tasks.findIndex((task) => task.id === id)
    if (index === -1) {
      return missing('Task not found')
    }

    // Delete task
    tasks.splice(index, 1)

    // Update KV
    await TODOS.put(email, JSON.stringify(tasks))

    return json({ success: true })
  })

  // Fetch all non-matched routes from static hosting
  .all('*', ({ url }) => fetch(url))

// Fetch event handler
addEventListener('fetch', (event) =>
  event.respondWith(router.handle(event.request)),
)

// Schedule event handler
addEventListener('scheduled', (event) =>
  event.respondWith(async (event) => {
    // List all todo users
    const { keys } = await TODOS.list()

    // Make sure the keys are all emails
    const emails = keys
      .map((key) => key.name)
      .filter((key) =>
        key.match(
          /^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/,
        ),
      )

    // Fetch the todos for each user
    const promises = emails.map(async (email) => {
      const tasks = await TODOS.get(email, { type: 'json' })

      // Only email tasks that are not finished
      tasks.filter((task) => !task.completed)

      // Create email HTML
      const html = `
        <h1>Your Todos</h1>
        ${tasks.map((task) => `<p>[ ] ${task.task}</p>`).join('\n')}
      `

      // Return Sendgrid email send Promise
      return fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${SENDGRID_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [
            {
              to: [
                {
                  email,
                },
              ],
            },
          ],
          from: {
            email: 'noreply@workerscourse.com',
          },
          subject: 'Your Workers Todos',
          content: [
            {
              type: 'text/html',
              value: html,
            },
          ],
        }),
      })
    })

    // Wait for all Promises to complete
    event.waitUntil(Promise.all(promises))
  }),
)
