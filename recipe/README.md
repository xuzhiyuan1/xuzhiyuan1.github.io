# Recipe

`/recipe/` is a static presentation layer backed by the private Recipe API.
The repository does not contain the live recipe collection or uploaded photos.

```text
GitHub Pages
  recipe/index.html + category pages + assets/js/render.js
      └── GET https://recipe.xuzhiyuan1.top/data

School server
  backend/recipe/server.py
  state/recipes.json + images/
      └── private editor: /tools/recipe/
```

## Data contract

`GET /data` returns public categories and normalized recipes.  The category
pages use the shared renderer and filter this collection by `category`; recipe
details are expanded inline rather than generating a directory for every dish.

The editor uses these authenticated operations:

- `POST /auth` — register or check a device;
- `POST /upload` — upload and compress a recipe image;
- `POST /recipe` — create or replace one complete recipe;
- `POST /del` — remove a recipe and its associated images.

## Adding or changing a dish

Use `/tools/recipe/` rather than editing a JSON file in GitHub.  The backend
normalizes the recipe structure and stores it with the images.  The public page
will pick up the change on the next request; no Pages deploy is necessary.

The static pages should only change when modifying layout, rendering behavior,
or public copy.  That division keeps mutable culinary data out of the frontend
repository and avoids the obsolete `_data/*.json` workflow.
