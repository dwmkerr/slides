.PHONY: dev help test

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-12s\033[0m %s\n", $$1, $$2}'

dev: ## Open the demo with live editing
	@npm run dev

.PHONY: hero
hero: ## Rebuild the animated hero image
	@./scripts/build-hero-gif.sh

test: ## Run unit and project checks
	@npm test
