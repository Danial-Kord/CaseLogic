from backend.config import load_settings
from backend.ingestion.adapters.firecrawl import FirecrawlAdapter
a = FirecrawlAdapter(load_settings())
r = a.search('California Vehicle Code pedestrian', max_results=2)
print(r)