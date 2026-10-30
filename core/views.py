
import logging
import re

from django.views.generic import TemplateView
from django.template import TemplateDoesNotExist
from django.http import Http404, HttpResponse
from django.views.decorators.cache import never_cache

# Create your views here.
logger = logging.getLogger(__name__)

LOOKS_LIKE_A_FILE = re.compile(r'/[^/]+\.[A-Za-z0-9]{1,8}$')

class SpaView(TemplateView):
    """Serves the built React application.

    Every unmatched path lands here so the browser's router can handle deep
    links — somebody bookmarking ``/positions`` and reloading must not get a
    404 from Django.

    **Except paths that name a file.** Answering those with the shell is how
    ``/favicon.ico`` becomes 415 bytes of HTML that a browser is asked to
    decode as an icon, and how a mistyped asset URL returns 200 with a page
    inside it — a missing script that reports no error anywhere. They get a
    404, which is the true answer and the one a build pipeline can see.
    """

    template_name = 'index.html'

    def get(self, request, *args, **kwargs):
        if LOOKS_LIKE_A_FILE.search(request.path):
            raise Http404(f'{request.path} is not a page and not a file we have')
        try:
            return super().get(request, *args, **kwargs)
        except TemplateDoesNotExist:
            # The interface has not been built. A plain instruction beats a
            # stack trace, and a 503 rather than a 200 so a health check or a
            # deployment script notices.
            return HttpResponse(
                '<h1>AlgoNova</h1><p>The interface has not been built yet. '
                'Run <code>npm install &amp;&amp; npm run build</code>, or '
                '<code>npm run dev</code> for the development server.</p>',
                status=503, content_type='text/html')

spa = never_cache(SpaView.as_view())