from textwrap import dedent
from aiohttp import web


error_template = dedent("""
    <!doctype html>
        <head>
            <title>Error {error_code} - Hyperdeck UI</title>
            <link rel="stylesheet" type="text/css" href="resources/style.css" />
        </head>
        <body>           
            <div id="container">
                <h1>Blackmagic Design - Hyperdeck UI: Error</h1>
                <div id="main" style="text-align: center; content-align: center;">
                    <p>{error_message}</p>
                    <button onclick=window.location.replace("/")>Home</button>
                </div>
            </div>
        </body>
""")

async def handle_500(request):
    template = error_template.format(error_code=500, error_message='500: Internal Server Error')
    return web.Response(
        text=template,
        content_type='text/html',
    )

def create_error_middleware():
    @web.middleware
    async def error_middleware(request, handler):
        try:
            return await handler(request)
        except web.HTTPException as ex:
            template = error_template.format(error_code=ex.status, error_message='{}: {}'.format(ex.status, ex.reason))
            return web.Response(
                text=template,
                content_type='text/html',
            )
        except Exception:
            return await handle_500(request)

    return error_middleware

def setup_middlewares(app):
    error_middleware = create_error_middleware()
    app.middlewares.append(error_middleware)