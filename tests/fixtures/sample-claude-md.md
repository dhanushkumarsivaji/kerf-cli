# Project XYZ

## Overview
This is a test project for kerf audit testing. It contains various sections
designed to test the CLAUDE.md linter and attention curve analysis.

## Conventions
- Use TypeScript for all code
- ESM modules only
- Pin exact dependency versions

## Architecture
The project is structured as a monorepo with three packages:
- @xyz/core: Shared business logic
- @xyz/api: REST API server
- @xyz/web: React frontend

The API server uses Express.js with middleware for auth, logging, and rate limiting.
The frontend uses React 18 with React Query for data fetching.
Database is PostgreSQL with Prisma ORM.

## Important Rules
NEVER commit directly to main branch.
ALWAYS run tests before pushing.
MUST use conventional commits format.
CRITICAL: Never expose API keys in code.

## Database Schema
The database has the following tables:
- users: id, email, name, created_at
- projects: id, name, owner_id, created_at
- tasks: id, title, project_id, assignee_id, status, created_at
- comments: id, body, task_id, author_id, created_at
- attachments: id, url, task_id, uploaded_by, created_at

## API Endpoints
### Auth
- POST /api/auth/login
- POST /api/auth/register
- POST /api/auth/refresh
- DELETE /api/auth/logout

### Projects
- GET /api/projects
- POST /api/projects
- GET /api/projects/:id
- PUT /api/projects/:id
- DELETE /api/projects/:id

### Tasks
- GET /api/projects/:id/tasks
- POST /api/projects/:id/tasks
- GET /api/tasks/:id
- PUT /api/tasks/:id
- DELETE /api/tasks/:id

### Comments
- GET /api/tasks/:id/comments
- POST /api/tasks/:id/comments
- DELETE /api/comments/:id

## Frontend Components
- AppLayout: Main layout with sidebar navigation
- ProjectList: Displays all projects
- ProjectDetail: Single project view
- TaskBoard: Kanban-style task board
- TaskCard: Individual task card
- TaskDetail: Task detail modal
- CommentThread: Comments section
- UserProfile: User settings page

## Deployment
Deploy using Docker Compose to AWS ECS.
CI/CD pipeline runs on GitHub Actions.
Staging deploys on every push to develop.
Production deploys on release tag.

## Testing Strategy
- Unit tests with vitest
- Integration tests with supertest
- E2E tests with Playwright
- Coverage threshold: 80%

## PR Review Process
IMPORTANT: All PRs must have at least one approval.
NEVER merge PRs that fail CI.
ALWAYS squash merge to keep history clean.
Check for security vulnerabilities in dependencies.

Review checklist:
1. Code compiles without errors
2. Tests pass
3. No linting warnings
4. Documentation updated
5. Changelog entry added
6. Breaking changes noted
7. Performance impact assessed
8. Security review completed

## Monitoring
Use Grafana for dashboards.
Alerts go to #ops-alerts Slack channel.
PagerDuty for critical incidents.
Log level: info in production, debug in staging.

## Known Issues
- Rate limiter occasionally blocks legitimate requests
- File upload timeout on large files (>100MB)
- WebSocket reconnection can fail silently
- CSS specificity issues in dark mode

## Local Development Setup
1. Clone the repo
2. Install Node.js 20+
3. Run npm install
4. Copy .env.example to .env
5. Start PostgreSQL: docker compose up db
6. Run migrations: npx prisma migrate dev
7. Start dev server: npm run dev
8. Open http://localhost:3000

## Environment Variables
DATABASE_URL=postgresql://localhost:5432/xyz
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-here
AWS_REGION=us-east-1
S3_BUCKET=xyz-uploads
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASS=password

## Third Party Integrations
- Stripe for payments
- SendGrid for transactional email
- Twilio for SMS notifications
- Sentry for error tracking
- Datadog for APM
- LaunchDarkly for feature flags

## Migration Guide v1 to v2
When upgrading from v1 to v2:
MUST run the database migration script first.
NEVER run v2 code against a v1 database.
IMPORTANT: Back up the database before migrating.

Steps:
1. Stop all v1 instances
2. Back up PostgreSQL
3. Run: npx prisma migrate deploy
4. Verify migration: npm run verify-migration
5. Deploy v2 code
6. Verify health checks
7. Remove v1 artifacts

## Dependency Policy
CRITICAL: Pin all dependency versions.
NEVER use ^ or ~ in package.json.
ALWAYS review changelogs before upgrading.
Run npm audit weekly.

## Performance Guidelines
- Database queries must return in <100ms
- API responses must return in <500ms
- Bundle size must stay under 250KB gzipped
- Lighthouse score must stay above 90
- No N+1 queries
- Use connection pooling
- Cache frequently accessed data in Redis

## Accessibility
- All interactive elements must be keyboard navigable
- Color contrast ratio must be at least 4.5:1
- All images must have alt text
- Forms must have proper labels
- Screen reader testing with NVDA/VoiceOver

## Security
NEVER store passwords in plain text.
ALWAYS hash with bcrypt (cost factor 12).
MUST validate and sanitize all user input.
CRITICAL: Enable CSRF protection on all forms.
Use Content-Security-Policy headers.
Enable rate limiting on auth endpoints.
Log all authentication attempts.
