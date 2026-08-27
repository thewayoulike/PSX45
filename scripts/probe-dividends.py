import re
import requests
from bs4 import BeautifulSoup

r = requests.get("https://dps.psx.com.pk/company/OGDC", timeout=30)
text = r.text
for pat in [r'href="#[^"]+"', r'/[^"\']*dividend[^"\']*']:
    for m in re.findall(pat, text, re.I)[:15]:
        print(m)

soup = BeautifulSoup(text, "html.parser")
for tab in soup.select(".tabs__item, .tab, [role=tab], nav a"):
    t = tab.get_text(" ", strip=True)
    if t:
        print("TAB", t, tab.get("href"), tab.get("data-target"))
