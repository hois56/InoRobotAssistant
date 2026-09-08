# DWG CAD converter bridge

The 3D Simulation browser imports ASCII DXF directly. DWG conversion is kept
behind a local bridge because the browser does not provide a native DWG parser.
No converter executable or SDK is bundled in this repository.

The bridge used by the application is configurable through the adapter and
defaults to `http://127.0.0.1:8767`.

## Health endpoint

`GET /health` should return HTTP 200 with JSON such as:

```json
{ "ready": true, "name": "local-dwg-bridge", "version": "1.0.0" }
```

## Conversion endpoint

`POST /convert/dwg` accepts the DWG bytes as the request body. The application
sets `Content-Type: application/acad`, `X-CAD-Filename`, and
`X-CAD-Unit-Override` headers. The bridge may use the unit override when
normalizing coordinates.

The response must be JSON containing either `document` or `cad2d`, with the
normalized CAD2D document shape used by `cad2d-core.mjs`:

```json
{
  "document": {
    "schemaVersion": 1,
    "source": { "name": "drawing.dwg", "extension": "dwg" },
    "units": { "source": "millimeter", "scaleToMillimeter": 1 },
    "drawing": { "layers": [] },
    "entities": []
  }
}
```

Each entity should preserve its source `handle`, `layer`, and original CAD
coordinates. The application validates and normalizes the returned document
before rendering it on the XY plane.
