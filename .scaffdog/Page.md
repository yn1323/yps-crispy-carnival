---
name: "Page"
root: "./app"
output: []
ignore: []
questions:
  component: "What is Page name??(without 'Page' suffix)"
  path: "What is path to get above page??(i.e. login/forgetPassword)"
---


# `app/{{ inputs.path }}/page.tsx`

```tsx
{{ "Page/page.tsx" | read }}
```

