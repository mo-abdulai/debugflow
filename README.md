# DebugFlow — AI Debugging Agent with OpenHands

DebugFlow is an AI-powered debugging agent that analyzes errors, stack traces, and code snippets to provide structured explanations, root cause analysis, and actionable fixes — built using OpenHands.

Designed for developers, DebugFlow focuses on **clarity, speed, and efficiency**, combining a clean user experience with a lightweight infrastructure-style backend.

---

## Features

- **AI-Powered Debugging**  
  Analyze errors, stack traces, and code snippets using OpenHands

- **Structured Analysis Output**
  - Problem summary
  - Root cause
  - Fix steps
  - Improved code
  - Explanation of why the fix works

- **Smart Caching Layer**
  - Avoids re-processing identical inputs
  - Reduces redundant model calls
  - Improves performance and cost efficiency

- **Automatic Issue Classification**
  - Detects common error types (TypeError, ReferenceError, etc.)
  - Adds context before analysis

- **Agent Pipeline Architecture**
  - Normalize input
  - Classify issue
  - Analyze with OpenHands
  - Parse + validate response
  - Cache result

- **Cache Awareness**
  - Shows cache HIT / MISS in UI
  - Makes system behavior transparent

---

## How It Works

DebugFlow follows a lightweight agent-style pipeline:

```text
User Input
   ↓
Normalize Input
   ↓
Hash Input
   ↓
Cache Check
   ├── HIT → Return Cached Result
   └── MISS
         ↓
   Classify Issue Type
         ↓
   OpenHands Analysis
         ↓
   Parse + Validate Output
         ↓
   Store in Cache
         ↓
   Return Structured Response
```

## Tech Stack

- Frontend: Next.js (App Router), TypeScript, Tailwind CSS
- Backend: Next.js API Routes
- AI Layer: OpenHands integration
- Caching: In-memory `Map` with TTL
- Architecture: Agent-style pipeline with modular utilities

## Project Structure

```text
app/
├── page.tsx
└── api/
    └── analyze/
        └── route.ts

lib/
├── openhands.ts
├── cache.ts
├── hash.ts
├── classify.ts
├── normalize.ts

types/
└── analysis.ts
```

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/yourusername/debugflow.git
cd debugflow
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set environment variables

Create `.env`:

```bash
OPENHANDS_BASE_URL=https://app.all-hands.dev
OPENHANDS_LLM_MODEL=your_model_here
OPENHANDS_LLM_API_KEY=your_key_here
OPENHANDS_LLM_BASE_URL=
OPENHANDS_SESSION_API_KEY=your_session_key_here
OPENHANDS_TIMEOUT_MS=25000
OPENHANDS_WORKING_DIR=/tmp
```

### 4. Run the app

```bash
npm run dev
```

Open: <http://localhost:3000>

## Example

### Input

```txt
TypeError: Cannot read properties of undefined (reading 'map')
```

```tsx
const UserList = ({ users }) => {
  return (
    <div>
      {users.map((user) => (
        <p key={user.id}>{user.name}</p>
      ))}
    </div>
  );
};
```

### Output

- Summary: `.map()` is being called on an undefined value
- Root Cause: `users` is undefined at runtime
- Fix: Add fallback or conditional rendering
- Improved Code: Uses safe default array
- Why It Works: Prevents runtime crash by ensuring valid array

## Key Design Decisions

### 1. Structured Output > Raw AI Response

Ensures consistency and usability for developers.

### 2. Caching Layer

Reduces redundant analysis and improves performance.

### 3. Classification Before Analysis

Adds context and improves model accuracy.

### 4. Fail-Safe Parsing

Gracefully handles malformed AI responses.

## Future Improvements

- Persistent cache (Redis / database)
- Multi-step reasoning visualization
- Debugging history + sessions
- CLI version
- GitHub integration for issue analysis
- Real-time agent streaming

## Acknowledgments

Built as part of the OpenHands Champions Hackathon.

Special thanks to the OpenHands team for enabling developer-first AI tooling.

## About

DebugFlow is an experiment in building practical AI-powered developer tools that combine:

- intelligent automation
- explainability
- lightweight infrastructure
