# Farkle Bot
A Discord bot to play Farkle with friends!

## Setup
1. Clone this repo: `git clone <your-repo-url>`
2. Install dependencies: `npm install`
3. Create a `.env` file with: `DISCORD_TOKEN=your_bot_token`
4. Run locally: `node index.js`
5. Or deploy to Heroku (see below).

## Heroku Deployment
- Create a Heroku app: `heroku create`
- Set token: `heroku config:set DISCORD_TOKEN=your_bot_token`
- Push: `git push heroku main`
- Start: `heroku ps:scale worker=1`

## Commands
- `!farkle`: Start a game.