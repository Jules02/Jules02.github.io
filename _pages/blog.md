---
layout: default
permalink: /blog/
title: blog
nav: true
nav_order: 1
pagination:
  enabled: true
  collection: posts
  permalink: /page/:num/
  per_page: 5
  sort_field: date
  sort_reverse: true
  trail:
    before: 1 # The number of links before the current page
    after: 3 # The number of links after the current page
---

<div class="post blog">

  <header class="post-header">
    <h1 class="post-title">{{ site.blog_name | default: page.title }}</h1>
    {% if site.blog_description %}
      <p class="post-description">{{ site.blog_description }}</p>
    {% endif %}
  </header>

{% if site.display_tags and site.display_tags.size > 0 or site.display_categories and site.display_categories.size > 0 %}

  <ul class="blog-filters">
    {% for tag in site.display_tags %}
      <li><a href="{{ tag | slugify | prepend: '/blog/tag/' | relative_url }}">#{{ tag }}</a></li>
    {% endfor %}
    {% for category in site.display_categories %}
      <li><a href="{{ category | slugify | prepend: '/blog/category/' | relative_url }}">{{ category }}</a></li>
    {% endfor %}
  </ul>
{% endif %}

{% if page.pagination.enabled %}
{% assign postlist = paginator.posts %}
{% else %}
{% assign postlist = site.posts %}
{% endif %}

  <ul class="blog-list">
    {% for post in postlist %}
      {% if post.external_source == blank %}
        {% assign read_time = post.content | number_of_words | divided_by: 180 | plus: 1 %}
      {% else %}
        {% assign read_time = post.feed_content | strip_html | number_of_words | divided_by: 180 | plus: 1 %}
      {% endif %}

      {% if post.redirect == blank %}
        {% assign post_href = post.url | relative_url %}
        {% assign post_external = false %}
      {% elsif post.redirect contains '://' %}
        {% assign post_href = post.redirect %}
        {% assign post_external = true %}
      {% else %}
        {% assign post_href = post.redirect | relative_url %}
        {% assign post_external = false %}
      {% endif %}

      <li class="blog-item{% if post.thumbnail %} has-thumb{% endif %}">
        <div class="blog-item-body">
          <p class="blog-item-meta">
            <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: '%b %d, %Y' }}</time>
            <span aria-hidden="true">&middot;</span>
            {{ read_time }} min read
            {% if post.external_source %}
              <span aria-hidden="true">&middot;</span>
              {{ post.external_source }}
            {% endif %}
          </p>

          <h2 class="blog-item-title">
            <a href="{{ post_href }}"{% if post_external %} target="_blank" rel="noopener noreferrer"{% endif %}>{{ post.title }}</a>
            {% if post_external %}<i class="fa-solid fa-arrow-up-right-from-square fa-2xs"></i>{% endif %}
          </h2>

          {% if post.description %}
            <p class="blog-item-desc">{{ post.description }}</p>
          {% endif %}

          {% if post.tags.size > 0 or post.categories.size > 0 %}
            <ul class="blog-item-tags">
              {% for category in post.categories %}
                <li><a href="{{ category | slugify | prepend: '/blog/category/' | relative_url }}">{{ category }}</a></li>
              {% endfor %}
              {% for tag in post.tags %}
                <li><a href="{{ tag | slugify | prepend: '/blog/tag/' | relative_url }}">#{{ tag }}</a></li>
              {% endfor %}
            </ul>
          {% endif %}
        </div>

        {% if post.thumbnail %}
          <a class="blog-item-thumb" href="{{ post_href }}" tabindex="-1" aria-hidden="true"{% if post_external %} target="_blank" rel="noopener noreferrer"{% endif %}>
            <img src="{{ post.thumbnail | relative_url }}" alt="" loading="lazy">
          </a>
        {% endif %}
      </li>
    {% endfor %}

  </ul>

{% if page.pagination.enabled %}
{% include pagination.liquid %}
{% endif %}

</div>
