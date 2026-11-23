.PHONY: all dev build lint typecheck test clean docker-up docker-down

all: lint typecheck test build

dev:
	npm run dev

build:
	npm run build

lint:
	npm run lint

typecheck:
	npm run typecheck

test:
	npm run test

clean:
	rm -rf frontend/.next frontend/out .pytest_cache backend/__pycache__

docker-up:
	docker compose up --build

docker-down:
	docker compose down
