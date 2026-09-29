---
"@plainworks/auth": minor
---

`login` and `logout` from `@plainworks/auth/client` no longer touch the DOM, so they run on React Native too. They take a required `navigator` that performs the redirect and the logout post.

- **Browsers pass `formPostNavigator`** from the new `@plainworks/auth/form-post` entry. It navigates with `location.assign`, submits logout as a form post, and reads the `__Host-` CSRF cookie. Use `createFormPostNavigator` to pick a different cookie name.
- **Other hosts implement `AuthNavigator`.** A missing navigator throws `AuthError` with kind `auth/config`.
- `AuthNavigate` and `AuthSubmit` are replaced by `AuthNavigator`.
