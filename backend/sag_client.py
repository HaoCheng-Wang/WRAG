"""Async HTTP client for calling SAG's API + transparent proxy."""

from __future__ import annotations

import httpx
from fastapi import Request
from fastapi.responses import StreamingResponse, Response


class SagClient:
    """Async client that wraps SAG's REST API."""

    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.client = httpx.AsyncClient(timeout=300.0)

    # ------------------------------------------------------------------
    # Document ingestion
    # ------------------------------------------------------------------

    async def upload_document(
        self,
        project_id: str,
        title: str,
        content: str,
        file_name: str,
    ) -> dict:
        """Call SAG POST /api/documents/upload (sync ingestion)."""
        resp = await self.client.post(
            f"{self.base_url}/api/documents/upload",
            json={
                "sourceId": project_id,
                "title": title,
                "fileName": file_name,
                "content": content,
            },
        )
        resp.raise_for_status()
        return resp.json()

    async def create_upload_job(
        self,
        project_id: str,
        title: str,
        content: str,
        file_name: str,
    ) -> dict:
        """Call SAG POST /api/documents/upload/jobs (async ingestion)."""
        resp = await self.client.post(
            f"{self.base_url}/api/documents/upload/jobs",
            json={
                "sourceId": project_id,
                "title": title,
                "fileName": file_name,
                "content": content,
            },
        )
        resp.raise_for_status()
        return resp.json()

    async def get_upload_job(self, job_id: str) -> dict:
        """Call SAG GET /api/documents/upload/jobs/{job_id}."""
        resp = await self.client.get(
            f"{self.base_url}/api/documents/upload/jobs/{job_id}"
        )
        resp.raise_for_status()
        return resp.json()

    # ------------------------------------------------------------------
    # Transparent proxy
    # ------------------------------------------------------------------

    async def proxy(self, request: Request) -> Response:
        """Forward any request to SAG and return the response.

        Handles both regular JSON responses and SSE streaming transparently.
        """
        target_url = f"{self.base_url}{request.url.path}"

        # Forward query params
        if request.url.query:
            target_url += f"?{request.url.query}"

        headers = dict(request.headers)
        headers.pop("host", None)  # let httpx set the correct host header

        body = await request.body() if request.method in ("POST", "PUT", "PATCH") else None

        req = self.client.build_request(
            method=request.method,
            url=target_url,
            headers=headers,
            content=body,
        )

        # Determine if this is an SSE endpoint
        is_sse = "text/event-stream" in request.headers.get("accept", "")

        if is_sse:
            # Stream the response back for SSE
            async def _sse_iter():
                async with self.client.stream(
                    method=request.method,
                    url=target_url,
                    headers=headers,
                    content=body,
                ) as resp:
                    async for chunk in resp.aiter_bytes():
                        yield chunk

            return StreamingResponse(
                _sse_iter(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
            )

        # Regular request-response
        resp = await self.client.send(req)
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            headers=dict(resp.headers),
        )

    async def close(self) -> None:
        await self.client.aclose()
