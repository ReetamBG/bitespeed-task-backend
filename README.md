# Bitespeed Task Backend

A Node.js/Express backend application with Prisma ORM and PostgreSQL.

## Live URL - https://bitespeed-task-backend.vercel.app

### Note:
The requirement doc had a typo in the `primaryContatctId` field of the response, kept it as it is if needed for testing

## Project Structure

```
bitespeed-task-backend/
├── src/
│   ├── index.ts                    # Application entry point
│   ├── controllers/                # Request handlers
│   │   └── identify.controller.ts
│   ├── services/                   # Business logic
│   │   └── identify.service.ts
│   ├── routes/                     # API routes
│   │   └── identify.route.ts
│   └── lib/                        # Utilities
│       └── prisma.ts
├── prisma/
│   ├── schema.prisma              # Database schema
│   └── migrations/                # Database migrations
├── package.json
└── tsconfig.json
```

## Installation

1. Clone the repository:
```bash
git clone https://github.com/ReetamBG/bitespeed-task-backend.git
cd bitespeed-task-backend
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file in the root directory with your database connection:
```
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
```

4. Run database migrations:
```bash
npm run prisma:migrate
```

## Running the Application

### Development Mode
```bash
npm run start:dev
```

### Production Mode
1. Build the project:
```bash
npm run build
```

2. Start the server:
```bash
npm run start
```

## Available Scripts

- `npm run start:dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:deploy` - Run migrations (production)
- `npm run type-check` - Type check without building

## How I Reached the Solution 

The key challenge was understanding that we're not storing users but rather **fragments of contacts** that need to be linked together.

### Breaking Down the Requirements
1. Contacts with shared email or phone belong to the same person
2. The oldest contact becomes the `primary`
3. New information creates `secondary` contacts - "new information" here implies if a contact exists with either the same email or phone, but not both
4. Primary contacts can be demoted to secondary when identities merge - "identities merging" here refers to when we have two different primary contacts and a third contact comes relating to both the previous two primary contacts - then we merge the first two primary contacts keeping one primary and the rest as secondary

### Core Structure

Enforces a **flat hierarchy**: one primary with all secondaries pointing directly to it  (rather than it being something like Primary -> Secondary -> Secondary) — no chains or trees

This flat structure simplified the approach:
- **Queries**: Just find where `id = primary` OR `linkedId = primary`
- **Merges**: Convert newer primaries to secondaries and re-link their children
- **Responses**: Easy aggregation of emails/phones from the cluster

### Implementation Flow

The `/identify` endpoint follows these steps:

1. **Find matches**: Query contacts with matching email **OR** phone
2. **Resolve primaries**: Identify which primary(ies) these contacts belong to
3. **Merge if needed**: If multiple primaries exist, merge them (oldest wins)
4. **Detect new info**: Check if the request introduces new email/phone combinations
5. **Create secondary**: Add a new secondary contact only if there's new information
6. **Return constructed response**: All emails, phones, and secondary IDs built into a single response and returned back to the caller

### Key Design Decisions

- **Transactions for merges**: Converting primaries and re-linking and creating secondaries if needed - all these operations together must be atomic to avoid corrupting the identity graph
 
- **Deterministic merges**: Always choosing the oldest primary ensures consistent results

- **The most challenging part* was handling the case where two independent primary Contacts suddenly needed to merge. Initially, I underestimated this scenario because it requires updating multiple rows consistently while preserving the flat invariant but took some time to figure this out😅.
