# SocialHub — Mini Social Media App

A full-stack mini social media app using **HTML, CSS, vanilla JavaScript, Node.js, Express and SQLite**.

## Features
- Signup, login and logout (passwords hashed with bcrypt)
- User profile with bio and profile photo
- Create text posts and image posts
- Global feed
- Like / unlike posts
- Add and view comments
- Search users
- Follow / unfollow users
- Follower and following counts
- Responsive layout

## Requirements
- Node.js 18 or newer
- npm

## Run locally
1. Extract the ZIP and open the `socialhub` folder in VS Code.
2. Open a terminal in that folder.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the server:
   ```bash
   npm start
   ```
5. Open **http://localhost:3000** in your browser.

The SQLite database is created automatically at `data/socialhub.db`. Uploaded images are stored in `uploads/`.

## Project structure
```text
socialhub/
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── data/             # SQLite database created on first run
├── uploads/          # Uploaded images
├── database.js       # Database schema and connection
├── server.js         # Express server and API routes
├── package.json
└── README.md
```

## Main API routes

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/me` | Current logged-in user |
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/feed` | Get all posts |
| POST | `/api/posts` | Create a post |
| POST | `/api/posts/:id/like` | Like / unlike |
| GET | `/api/posts/:id/comments` | Get comments |
| POST | `/api/posts/:id/comments` | Add comment |
| GET | `/api/users/search?q=` | Search users |
| GET | `/api/users/:id` | User profile and posts |
| POST | `/api/users/:id/follow` | Follow / unfollow |
| PUT | `/api/profile` | Update bio / avatar |
| GET | `/api/users/:id/followers` | List followers |
| GET | `/api/users/:id/following` | List following |

## Notes before deployment
This is a learning/demo project, not production-hardened. Before deploying publicly:
- Set a long, random `SESSION_SECRET` environment variable.
- Use HTTPS and secure session cookies.
- Use a persistent session store instead of Express's default in-memory store.
- Add CSRF protection, rate limiting, stricter upload validation and moderation/reporting.
- Store uploaded images on durable object storage if deploying to an ephemeral host.
- Add pagination and database backups.
