---
layout: page
title: Quantum Reservoir Computing for Fraud Detection
description: Joint Interdisciplinary Project with Quobly (Delft, Q1 2026–27)
importance: 1
category: coursework
github: https://github.com/zulee1711/cc_fraud_detection_using_QRC
---

**Q1 2026–27 · [Joint Interdisciplinary Project (TU Delft)](https://www.jointinterdisciplinaryproject.nl) · Industry partner: [Quobly](https://quobly.io)**

[Blog post]({% post_url 2026-11-12-jip-quantum-reservoir-computing %})

Over ten weeks of full-time work, our interdisciplinary student team was asked by Quobly, a French start-up building silicon spin-qubit quantum computers, to test whether credit-card fraud detection could be a viable near-term use case for quantum reservoir computing (QRC).

We framed the problem from a payment company's point of view, then benchmarked a sliding-window QRC on simulated card transactions against classical baselines, both in ideal simulation and at pulse level on a model of Quobly's hardware. I mostly worked on the quantum machine learning side.

The outcome was negative. After equal tuning, a classical reservoir of the same width beat the quantum one on customer fraud (0.59 vs 0.49 average precision), and on hardware, shot noise and run time ruled out real-time use. The blog post goes through the results in detail.
