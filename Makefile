.PHONY: validate validate-baseline doctor-serve story

validate:
	./scripts/validate-public-repo.sh

validate-baseline:
	./scripts/validate-inference-baseline.sh

doctor-serve:
	./scripts/workshop-doctor.sh serve --context "$${SERVE_CONTEXT}"

story:
	node story/build_inference_experiment_story.mjs
