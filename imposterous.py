#!/usr/bin/env python
import requests
from lxml.html import parse, tostring, fragment_fromstring
import re, os
import pylibmc

CACHE = pylibmc.Client(["127.0.0.1"], binary=True)

IMG_DIR = os.path.join(os.path.dirname(__file__), 'img/imposterous')


def getBody(url):
  root = parse(url)
  return root.xpath('//div[@class="inner"]/*')


def getImageUrl(div):
  """Given an image div, return its URL."""
  raw = tostring(div)
  m = re.search(r'<a href="([^"]+[.]scaled1000[.](?:png|gif|jpe?g))">', raw)
  return m and m.group(1)


def getUrl(url):
  data = CACHE.get(url)
  if data is None:
    r = requests.get(url)
    r.raise_for_status()
    CACHE.set(url, r.content)
    return r.content
  return data


def getImage(url):
  """Get image, return relative link to it."""
  filename = url.rpartition('/')[2]
  path = os.path.join(IMG_DIR, filename)
  if not os.path.exists(path):
    with open(path, 'w') as f:
      f.write(getUrl(url))
  return '/img/imposterous/' + filename


def fixImage(node):
  """Maybe fix an image node. Return the modified thing."""
  url = getImageUrl(node)
  if url is None:
    return node
  path = getImage(url)
  return fragment_fromstring('<img src="%s" />\n' % path)


GUESS_LANGUAGE = {
  'js': 'javascript',
  'py': 'python',
  'pyx': 'python',
  'c': 'c++',
  'cpp': 'c++',
  'cc': 'c++',
  'h': 'c++',
  'hpp': 'c++',
  'cxx': 'c++',
  'hxx': 'c++',
  'lisp': 'lisp',
  'clj': 'clojure',
  'el': 'elisp',
  'java': 'java',
  'mm': 'objective c',
}


def sourceFromGistJsUrl(url):
  """Given a gist js url, return the raw source code."""
  js = getUrl(url)
  m = re.search(r'"(https?://gist\.github\.com/raw/\d+/[0-9a-fA-F]+/[^"]+)\\"', js)
  if m:
    src = m.group(1)
    extension = src.rpartition('.')[2]
    lang = GUESS_LANGUAGE.get(extension, extension)
    return getUrl(m.group(1)), lang


def fixGist(m):
  """Fix gist: re substitution function."""
  src, lang = sourceFromGistJsUrl(m.group(1))
  return '{%% highlight %s %%}\n%s\n{%% endhighlight %%}' % (lang, src)


def toMarkdown(body):
  html = '\n'.join(tostring(fixImage(node)) for node in body)
  html = html.replace('&#13;', '').replace('\r', '').replace('<p></p>', '\n')
  html = re.sub(r'<p><strong style="font-size: medium;">([^<>\n]+)</strong></p>', r'\n## \1\n', html)
  html = re.sub(r'<p><span style="font-size: medium;"><strong>([^<>\n]+)</strong></span></p>',
                r'\n## \1\n', html)
  html = re.sub(r'<p>(.+)</p>', r'\1', html)
  html = re.sub(r'\s*target="_blank"', '', html)
  html = re.sub(r'\s*style="[^"\n><]*"', '', html)
  html = re.sub(r'<span>(.*?)</span>', r'\1', html)
  html = re.sub(r'\n<strong>(.*?)</strong>\n', r'\n## \1\n', html)
  html = re.sub(r'<strong>(.*?)</strong>', r'**\1**', html)
  html = re.sub(r'<a\s+href="([^"]+)"\s*>(.+?)</a>', r' [\2](\1) ', html)
  html = re.sub(r'(<img[^>]*>)', r'\n\1\n', html)

  html = re.sub(r'<script src="(https?://gist\.github\.com/\d+\.js)"></script>', fixGist, html)

  html = html.replace('&#160;', ' ')
  html = re.sub(r'\n{3,}', r'\n\n', html)
  html = re.sub(r' {2,}', r' ', html)
  html = re.sub('\) ([.,!\'"])', r')\1', html)
  return html


if __name__ == '__main__':
  import sys
  url = sys.argv[1]
  print toMarkdown(getBody(url))
