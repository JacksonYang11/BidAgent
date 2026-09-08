# Third Party Notices

WhaleTalk branding is supplied by the project owner. No license for the project's proprietary source or branding is granted by this file.

The original reference PDF and extracted screenshots are excluded from Git and are not redistributed as application assets.

Principal dependencies:

| Dependency | License / notice |
| --- | --- |
| FastAPI, Uvicorn, httpx | BSD or MIT family; consult installed distributions |
| PDF.js | Apache-2.0; distributed through the npm package |
| Lucide | ISC; distributed through the npm package |
| PyMuPDF | AGPL-3.0 or commercial licensing from its publisher |
| pdfplumber | MIT |
| python-docx | MIT |
| RapidOCR / ONNX Runtime | Consult the bundled code and model licenses; recognition models have their own provenance |

PyMuPDF licensing requires attention before distributing a proprietary build or providing a network service. Either comply with the applicable AGPL terms, obtain an appropriate commercial license, or replace the dependency with a reviewed alternative. This local prototype does not settle that licensing decision.

Browser asset installation retains library license files. Python packages and OCR weights are restored through dependency installation and are not committed to this repository. Review dependency and model notices before external distribution.
