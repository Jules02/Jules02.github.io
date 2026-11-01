---
layout: page
title: Learning Graph Invariants with PQCs
description: Mini-project for the Applied Quantum Algorithms course (Leiden, Q3–Q4 2025–26)
importance: 1
category: coursework
github: https://github.com/Jules02/aqal_project
---

**Q3–Q4 2025–26 · [Applied Quantum Algorithms course (Leiden University)](https://studiegids-archief.leidenuniv.nl/en/courses/131620/applied-quantum-algorithms)**

[Report (PDF)]({{ '/assets/pdf/aqal_report.pdf' | relative_url }})

In this mini-project for the Leiden Applied Quantum Algorithms elective course, I trained Parametrized Quantum Circuits (PQCs) to learn a graph invariant: connectivity.
The circuit ansätze were permutation-equivariant, embedding the problem's symmetry as an inductive bias, and had a number of parameters independent of graph size.
They reached around 75% test accuracy on 7- and 8-node graphs, including graphs not isormophic to any training graph.
Interestingly, a classical polynomial classifier on the encoded graphs needs a number of parameters exponential in the number of nodes; trained on adjacency matrices instead, it matched the quantum model's test accuracy but overfitted.
