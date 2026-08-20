# Contributing

This repository promotes validated inference experiments into portable labs.
Small, independently verifiable changes are preferred.

## Module Maturity

- `documented`: architecture and operating contract are present
- `imported`: code and manifests are present and portable
- `validated`: documented static and live checks have passed

Do not mark a module `validated` because it worked in another repository. Record
the checks performed from this standalone repository.

## Required Module Contents

Every executable module should include:

1. purpose and scope boundary
2. prerequisites and expected resources
3. parameterized configuration
4. static validation or dry-run command
5. live smoke check
6. application and GPU observability check
7. expected outputs and success criteria
8. rollback or cleanup instructions
9. sanitized benchmark record when performance is claimed

## Change Discipline

- preserve unrelated worktree changes
- change one experimental dimension at a time
- pin images and tool versions used for measured results
- use relative repository paths
- keep secrets, state, model artifacts, and raw results outside Git
- distinguish an observed result from a general recommendation
- run `make validate` before committing

## Documentation Changes

Keep shared methodology in `docs` and implementation details in the owning
experiment. Every measured claim must retain its workload and hardware boundary.
