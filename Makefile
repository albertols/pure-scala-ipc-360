.PHONY: dev test test-backend test-frontend check build regen-corpus generate-api

dev:            ## run backend + frontend together (Ctrl-C stops both)
	bash scripts/dev.sh

test: test-backend test-frontend

test-backend:
	mvn -q -am -pl backend test

test-frontend:
	cd frontend && pnpm test

check: test
	cd frontend && npx tsc --noEmit && (pnpm format --check || true)
	@echo "check done"

build:
	mvn -q package
	cd frontend && pnpm build

regen-corpus:   ## regenerate recipes over a TEMP COPY and diff vs committed corpus
	bash scripts/regen_corpus.sh

generate-api:   ## refresh frontend/src/api/types.gen.ts from a running backend
	cd frontend && pnpm generate:api
