# BrownBook 📔

A gamified task and habit tracker app built with Electron. Turn your daily to-dos into an RPG-like experience!

## Features

- **✅ Task Management**: Create one-time tasks and recurring habits.
- **🔄 Interval Recurring Tasks**: Set up complex schedules like "3 days on, 1 day off" for gym routines.
- **💰 Reward System**: Earn coins for completing tasks (`Hard` tasks = more coins!).
- **🛍️ Rewards Shop**: Spend coins on custom rewards. Shop prices increase after each purchase daily to prevent spamming!
- **📊 History & Stats**: Track your completion history and total earnings.
- **✨ Visuals**: Coin animations, clean UI, and satisfying interactions.
- **🔌 Data Privacy**: All data is stored locally on your machine.

## Getting Started

### Prerequisites

- Node.js installed
- npm installed

### Running the App

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the application:
   ```bash
   npm start
   ```

## Development

The project structure is simple and clean:
- `app.js`: Main application logic (task handling, rendering, data management)
- `index.html`: The UI structure
- `styles.css`: All styling and animations
- `main.js`: Electron main process configuration

## Data

Your data (tasks, history, coins) is stored in a JSON file on your local system:
- Mac: `~/Library/Application Support/brownbook/brownbook-data.json`
- Windows: `%APPDATA%/brownbook/brownbook-data.json`

This file is NOT committed to the repository, keeping your personal info private.
