import {
  json,
  missing,
  error,
  withParams,
  withContent,
  ThrowableRouter,
} from 'itty-router-extras'

import { nanoid } from 'nanoid'

const TTL = 60 * 60 * 24 * 7 // Expires KV entry after 7 days

const router = ThrowableRouter({ stack: true })

// Sets router paths
router
  .get('/api/todos/:email', withParams, async ({ email }) => {
    // Get tasks from email
    const tasks = (await TODOS.get(email, { type: 'json' })) || []

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
      await TODOS.put(email, JSON.stringify(tasks), { expirationTtl: TTL })

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
      await TODOS.put(email, JSON.stringify(tasks), { expirationTtl: TTL })

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
    await TODOS.put(email, JSON.stringify(tasks), { expirationTtl: TTL })

    return json({ success: true })
  })

  // Return 404 for all other routes
  .all('*', () => missing('404 Not Found'))

// Fetch event handler
addEventListener('fetch', (event) =>
  event.respondWith(router.handle(event.request)),
)

// Schedule event handler
addEventListener('scheduled', (event) => event.waitUntil(sendEmails()))

// Email sending function
const sendEmails = async () => {
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
    let tasks = await TODOS.get(email, { type: 'json' })

    // Only email tasks that are not finished
    tasks = tasks.filter((task) => !task.completed)

    if (tasks.length === 0) {
      return Promise.resolve()
    }

    // Create email HTML
    const html = `
      <h1>Your Todos</h1>
      ${tasks.map((task) => `<p>[ ] ${task.task}</p>`).join('\n')}
      <p><a href="https://todo.workerscourse.com/tasks/${email}">View all tasks</a></p>

      <hr />

      <h2>Introducing the Workers Course</h2>
      <p>Learn how to build performant apps on the edge with
      Cloudflare Workers, Pages, KV Store, Durable Objects and
      more.</p>
      <h3><a href="https://www.workerscourse.com"><strong>Launching soon!</strong></a></h3>
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

  return Promise.all(promises)
}
