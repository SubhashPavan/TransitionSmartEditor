# SOP Review Studio — Frontend

React + Vite + Tailwind v4 prototype of the SOP editor UI.

## Structure

```
frontend/
  src/
    App.jsx                        - top-level view switch (landing ↔ editor)
    main.jsx                       - React entry
    index.css                      - Tailwind import + small custom styles
    pages/
      Landing.jsx                  - upload screen
      Editor.jsx                   - main editor page (composes below)
    components/
      TitleBar.jsx                 - Word-like blue title bar
      Ribbon.jsx                   - tabs + toolbar
      LeftRail.jsx                 - filter chips + outline
      Canvas.jsx                   - Word-perfect document surface
      RightRail.jsx                - dispatcher for panels below
      ScreenshotEditorPanel.jsx    - screenshot candidates + AI search
      StepEditorPanel.jsx          - step rewrite + structural actions
      EmptyStatePanel.jsx          - default right-rail state
      ChatBar.jsx                  - bottom AI command bar
      MetricsOverlay.jsx           - full telemetry + quality drawer
  index.html
  vite.config.js
  package.json
```

## Run

```bash
cd frontend
npm install
npm run dev
```

Opens at **http://localhost:5190**.

## What's mocked vs real

- **Mocked**: all document content, screenshots (inline SVGs), metrics, quality scores,
  edit timeline. No backend calls. No file upload — clicking the drop zone jumps to the editor.
- **Real (works)**: view switching, panel selection (click any step or screenshot), filter
  chip toggling, chat placeholder cycling, metrics drawer, all hover/focus states.

## Where to plug in the backend later

- `pages/Landing.jsx` → `onEnter` currently just switches view; make it accept a File
- `pages/Editor.jsx` → holds document state (currently static in Canvas.jsx)
- `components/Canvas.jsx` → static JSX today; will consume a document JSON model
- `ScreenshotEditorPanel.jsx` → candidates/search should call `/api/screenshot/*`
- `StepEditorPanel.jsx` → rewrite buttons should call `/api/step/rewrite`
- `ChatBar.jsx` → chat input should call `/api/chat`
- `MetricsOverlay.jsx` → static metrics; will consume `/api/metrics/{docId}`
