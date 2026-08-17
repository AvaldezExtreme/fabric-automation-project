# Git Workflow & Version Control Guide

## Overview

This guide establishes a branching strategy for managing the Network Configuration Automation Tool with proper version control, code review, and release management.

---

## Branch Strategy: Git Flow

### Main Branches

#### `main` (Production)
- **Purpose**: Stable, production-ready code
- **Protection**: Require pull request reviews
- **Merging**: Only from `release/*` and `hotfix/*` branches
- **Tagging**: Tag all releases (v1.0.0, v1.0.1, etc.)

```bash
# View main branch
git checkout main
git log --oneline | head -10
```

#### `develop` (Development)
- **Purpose**: Integration branch for features
- **Base for**: Feature and release branches
- **Testing**: Pre-release testing happens here
- **Merging**: Features complete and tested

```bash
# Create develop from main initially
git checkout -b develop main
git push origin develop
```

### Supporting Branches

#### Feature Branches (`feature/*`)
- **Created from**: `develop`
- **Naming**: `feature/description` (lowercase, hyphens)
- **Examples**:
  - `feature/multi-sheet-support`
  - `feature/topology-visualization`
  - `feature/export-xlsx`
  - `feature/dhcp-validation`

```bash
# Create feature branch
git checkout -b feature/your-feature develop

# Make changes, commit
git add .
git commit -m "feat: Add your feature description"

# Push to remote
git push origin feature/your-feature

# Create pull request on GitHub/GitLab
# After review and approval:
git checkout develop
git pull origin develop
git merge --no-ff feature/your-feature
git push origin develop

# Delete feature branch
git branch -d feature/your-feature
git push origin --delete feature/your-feature
```

#### Release Branches (`release/*`)
- **Created from**: `develop`
- **Naming**: `release/v1.0.0`
- **Purpose**: Prepare production release
- **Activities**: Version bumping, bug fixes, documentation

```bash
# Create release branch
git checkout -b release/v1.1.0 develop

# Update version in package.json
# npm version minor

# Commit version bump
git commit -am "chore: Bump version to 1.1.0"

# Create release on main
git checkout main
git merge --no-ff release/v1.1.0
git tag -a v1.1.0 -m "Release version 1.1.0"
git push origin main --tags

# Merge back to develop
git checkout develop
git merge --no-ff release/v1.1.0
git push origin develop

# Delete release branch
git branch -d release/v1.1.0
git push origin --delete release/v1.1.0
```

#### Hotfix Branches (`hotfix/*`)
- **Created from**: `main`
- **Naming**: `hotfix/issue-description`
- **Purpose**: Critical production fixes
- **Examples**:
  - `hotfix/serial-validation-bug`
  - `hotfix/csv-export-crash`

```bash
# Create hotfix branch from main
git checkout -b hotfix/serial-bug main

# Fix the issue
git add .
git commit -m "fix: Correct serial number validation"

# Merge to main
git checkout main
git merge --no-ff hotfix/serial-bug
git tag -a v1.0.1 -m "Hotfix release 1.0.1"
git push origin main --tags

# Merge to develop
git checkout develop
git merge --no-ff hotfix/serial-bug
git push origin develop

# Delete hotfix branch
git branch -d hotfix/serial-bug
git push origin --delete hotfix/serial-bug
```

---

## Commit Message Guidelines

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, missing semicolons, etc.)
- `refactor`: Code refactoring without feature changes
- `perf`: Performance improvements
- `test`: Test additions or modifications
- `chore`: Build, dependencies, configuration

### Examples

```bash
# Feature
git commit -m "feat(upload): Add Excel sheet validation"

# Bug fix
git commit -m "fix(csv): Correct Site Engine column order"

# Documentation
git commit -m "docs(readme): Update installation instructions"

# Performance
git commit -m "perf(parser): Optimize XLSX parsing speed"

# With body
git commit -m "feat(topology): Add D3 visualization

- Displays MDF/IDF hierarchy
- Shows VLAN flow between switches
- Includes switch details on hover"

# With footer reference
git commit -m "fix(serial): Validate serial number format

Fixes #123"
```

---

## Release Management

### Version Numbering: Semantic Versioning

Format: `MAJOR.MINOR.PATCH` (e.g., 1.2.3)

- **MAJOR**: Breaking changes
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes

### Release Process

1. **Prepare Release Branch**
   ```bash
   git checkout -b release/v1.1.0 develop
   ```

2. **Update Version**
   ```bash
   # In package.json
   "version": "1.1.0"
   
   git commit -am "chore: Bump version to 1.1.0"
   ```

3. **Update CHANGELOG**
   ```bash
   # Create CHANGELOG.md entry
   ## [1.1.0] - 2026-01-20
   
   ### Added
   - New topology visualization
   - Multi-sheet support
   
   ### Fixed
   - Serial number validation bug
   
   git commit -am "docs: Update CHANGELOG for v1.1.0"
   ```

4. **Merge to Main**
   ```bash
   git checkout main
   git merge --no-ff release/v1.1.0
   git tag -a v1.1.0 -m "Release version 1.1.0"
   git push origin main --tags
   ```

5. **Merge to Develop**
   ```bash
   git checkout develop
   git merge --no-ff release/v1.1.0
   git push origin develop
   ```

6. **Clean Up**
   ```bash
   git branch -d release/v1.1.0
   git push origin --delete release/v1.1.0
   ```

---

## Code Review Process

### Creating a Pull Request

1. Push feature branch to remote
2. Open pull request to `develop` (or `main` for hotfixes)
3. Fill in pull request template

### Pull Request Template

```markdown
## Description
Brief description of changes

## Related Issue
Fixes #123

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation

## Testing Done
- [ ] Unit tests
- [ ] Manual testing
- [ ] Cross-browser testing

## Checklist
- [ ] Code follows style guide
- [ ] Self-reviewed code
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No new warnings generated
```

### Review Checklist

- [ ] Code is clear and maintainable
- [ ] Changes are minimal and focused
- [ ] Tests are included
- [ ] Documentation is updated
- [ ] No security issues introduced
- [ ] Performance is maintained
- [ ] Error handling is appropriate
- [ ] Breaking changes are documented

### Approval & Merge

```bash
# After approval, merge with --no-ff flag
git checkout develop
git pull origin develop
git merge --no-ff feature/your-feature
git push origin develop

# Delete branch
git branch -d feature/your-feature
git push origin --delete feature/your-feature
```

---

## Common Workflows

### Add a New Feature

```bash
# 1. Update develop
git checkout develop
git pull origin develop

# 2. Create feature branch
git checkout -b feature/new-feature

# 3. Make changes
# ... edit files ...
git add .
git commit -m "feat(module): Implement new feature"

# 4. Push and create PR
git push origin feature/new-feature
# Create PR on GitHub/GitLab

# 5. After approval, merge
git checkout develop
git pull origin develop
git merge --no-ff feature/new-feature
git push origin develop
```

### Fix a Bug in Develop

```bash
# 1. Create fix branch
git checkout -b fix/bug-description develop

# 2. Fix the issue
# ... edit files ...
git add .
git commit -m "fix(module): Describe the fix"

# 3. Push and create PR
git push origin fix/bug-description
# Create PR on GitHub/GitLab

# 4. Merge after review
git checkout develop
git pull origin develop
git merge --no-ff fix/bug-description
git push origin develop
```

### Fix Production Bug (Hotfix)

```bash
# 1. Create hotfix from main
git checkout -b hotfix/critical-bug main

# 2. Fix the issue
# ... edit files ...
git add .
git commit -m "fix(critical): Description of hotfix"

# 3. Test thoroughly
npm test

# 4. Merge to main and tag
git checkout main
git merge --no-ff hotfix/critical-bug
git tag -a v1.0.1 -m "Hotfix v1.0.1"
git push origin main --tags

# 5. Merge to develop
git checkout develop
git merge --no-ff hotfix/critical-bug
git push origin develop

# 6. Delete hotfix
git branch -d hotfix/critical-bug
git push origin --delete hotfix/critical-bug
```

---

## Branch Management

### View All Branches

```bash
# Local branches
git branch -a

# Remote branches
git branch -r

# Branches with tracking
git branch -vv
```

### Delete Branches

```bash
# Local deletion
git branch -d feature/old-feature

# Remote deletion
git push origin --delete feature/old-feature

# Force delete if not fully merged
git branch -D feature/old-feature
```

### Sync with Remote

```bash
# Fetch all changes
git fetch origin

# Update current branch
git pull origin

# Rebase on latest develop
git rebase origin/develop
```

---

## Useful Git Commands

### Check Status
```bash
git status
git log --oneline
git diff
```

### Undo Changes
```bash
# Unstage file
git reset HEAD filename

# Discard changes
git checkout -- filename

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Undo last commit (discard changes)
git reset --hard HEAD~1
```

### Stash Changes
```bash
# Save changes temporarily
git stash

# List stashes
git stash list

# Apply stash
git stash apply stash@{0}

# Delete stash
git stash drop stash@{0}
```

### Tag Management
```bash
# Create tag
git tag -a v1.0.0 -m "Release 1.0.0"

# List tags
git tag -l

# Push tags
git push origin --tags

# Delete tag
git tag -d v1.0.0
```

---

## Best Practices

1. **Keep Branches Short-lived**: Complete within 1-2 weeks
2. **Frequent Commits**: Commit small, logical changes
3. **Descriptive Messages**: Clear, concise commit messages
4. **Keep Develop Stable**: Only merge tested code
5. **Review Before Merging**: Always use pull requests
6. **Update Regularly**: Regularly pull from origin
7. **Delete Old Branches**: Clean up merged branches
8. **Use Tags for Releases**: Tag all production releases
9. **Protect Main/Develop**: Require reviews, block direct pushes
10. **Document Changes**: Update README and CHANGELOG

---

## Troubleshooting

### Accidental Push to Main
```bash
# Find the commit hash
git log main

# Revert the commit
git revert <commit-hash>

# Or reset (loses history)
git reset --hard <previous-commit>
```

### Feature Branch Out of Sync
```bash
# Update from develop
git checkout feature/your-feature
git rebase origin/develop

# Or merge
git merge origin/develop
```

### Merge Conflicts
```bash
# Show conflicts
git status

# Edit conflicted files manually

# Mark as resolved
git add conflicted-file

# Complete merge
git commit -m "Merge: Resolve conflicts"
```

---

## CI/CD Integration

### Recommended Checks

```yaml
# .github/workflows/ci.yml (GitHub Actions example)
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Install dependencies
        run: npm install
      - name: Run tests
        run: npm test
      - name: Security audit
        run: npm audit
```

---

**Last Updated**: 2026-01-15
**Maintained By**: Development Team
