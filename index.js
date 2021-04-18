import {
  json,
  missing,
  error,
  status,
  withParams,
  withContent,
  ThrowableRouter,
} from 'itty-router-extras'

import { nanoid } from 'nanoid'

const router = ThrowableRouter({ stack: true })

// Sets router paths
router
  .get('/', ({ url }) => {
    return fetch(url)
  })
  .get('/:email', ({ url }) => {
    url = new URL(url)
    url.pathname = '/tasks.html'
    return fetch(url.href)
  })
  .options('/api/*', () => {
    return new Response('', {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': '*',
        'Access-Control-Allow-Headers': '*',
      },
    })
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

      return json(
        { task },
        {
          headers: {
            'Access-Control-Allow-Origin': '*',
          },
        },
      )
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

      return json(
        { task },
        {
          headers: {
            'Access-Control-Allow-Origin': '*',
          },
        },
      )
    },
  )

  .delete(
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

      // Delete task
      tasks.splice(index, 1)

      // Update KV
      await TODOS.put(email, JSON.stringify(tasks))

      return json({ success: true })
    },
  )

  .post('/api/todos', withContent, async ({ content }) => {
    // Check if required data present
    if (!content.task) {
      return error(400, 'Missing task')
    }
    if (!content.email) {
      return error(400, 'Missing email')
    }

    // Check if valid email
    if (
      !content.email.match(
        /^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/,
      )
    ) {
      return error(400, 'Invalid email')
    }

    // Get existing tasks
    const tasks = (await TODOS.get(content.email, { type: 'json' })) || []

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
    await TODOS.put(content.email, JSON.stringify(tasks))

    return json({ tasks })
  })
  .post('/api/complete', withContent, async ({ content }) => {
    // Check if required data present
    if (!content.email) {
      return error(400, 'Missing email')
    }
    if (!content.id) {
      return error(400, 'Missing task id')
    }

    // Get all tasks
    const tasks = await TODOS.get(content.email, { type: 'json' })
    if (!tasks) {
      missing('Email not found')
    }

    // Get completed task index
    const index = tasks.findIndex((task) => task.id === content.id)
    if (index === -1) {
      return missing('Task not found')
    }

    // Set task completion state
    tasks[index].completed = content.completed === false ? false : true

    // Update KV
    await TODOS.put(content.email, JSON.stringify(tasks))

    return json({ task: tasks[index] })
  })

  .all('*', () => missing('404 Not Found'))

// Fetch event handler
addEventListener('fetch', (event) =>
  event.respondWith(router.handle(event.request)),
)
