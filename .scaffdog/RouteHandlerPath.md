---
name: "RouteHandler (Path Params)"
root: "./app/api"
output: []
ignore: []
questions:
  path: "What is path begins after app, type after api/ ??(i.e. auth/user/signup)"
  pathWithoutSlash: "Path without slash ??(i.e. AuthUserSignup)"
  method: "What is http method??(i.e. post, get, put, delete)"
---


# `{{ inputs.path }}/route.ts`

```tsx
{{ "RouteHandler/path/route.ts" | read }}
```
