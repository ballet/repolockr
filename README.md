![Uptime Status](https://img.shields.io/uptimerobot/status/m783943272-91f8a33855da57b823b1f98b)

# repolockr

A GitHub App built with [Probot](https://github.com/probot/probot) that locks files in pull requests.

The motivation for repolockr is to ensure that important project files are not modified by third-party pull requests. Imagine a new contributor inadvertently
deletes a test suite or a project configuration file. It is likely that CI checks will still pass, but if the PR is merged it will negatively impact the project.

repolockr addresses this problem by allowing a list of "locked files" to be specified, and any PR that modifies these files will be immediately marked as a failure. Importantly, the lock list is maintained on the master branch only, not in the PR head, so modifications to the repolockr config itself can be detected.

## Usage

Go to [repolockr](https://github.com/apps/repolockr) and press the big green install button. Then [create a config file](#repolockr-config-file). From now on, the repolockr app will automatically fail any PRs that modify the files you specify.

### repolockr config file

Create `.github/repolockr.yml` on your master branch. As an example:

```yaml
lock:
  - .github/repolockr.yml
  - .travis.yml
  - .gitignore

branches:
  allow:
    - develop
```

Currently, there are only two configuration options supported. `lock` is a list of files that should not be modified in PRs. `branches.allow` is a list of branches to allow any edits (i.e. not check modifications at all).

## Development

### Setup

```sh
# Install dependencies
npm install

# Run typescript
npm run build

# Run the bot
npm start
```

### Contributing

If you have suggestions for how repolockr could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2019 Micah Smith <micahjsmith@gmail.com>
