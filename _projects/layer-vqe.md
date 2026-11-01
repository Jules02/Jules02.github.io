---
layout: page
title: Layer VQE
description: Mini-project for the Applied Quantum Algorithms course (Delft, Q3–Q4 2025–26)
importance: 1
category: coursework
github: https://github.com/joaomartins06/Layer-Variational-Quantum-Eigensolver
---

**Q3–Q4 2025–26 · [Applied Quantum Algorithms course (TU Delft)](https://studiegids.tudelft.nl/courses/study-guide/educations/14691)**

[Slides (PDF)]({{ '/assets/pdf/aqad_slides.pdf' | relative_url }})

In this three-student group mini-project for the Delft Applied Quantum Algorithms elective course, we implemented and experimentally evaluated the Layer VQE (L-VQE) algorithm from [Liu et al. (2022)](https://doi.org/10.1109/TQE.2021.3140190), applied to the k-Community Detection and Max-Cut problems, including runs on IBM Quantum hardware. We confirmed the paper's main claim, the robustness of L-VQE to sampling noise, on Max-Cut: with the same iteration budget, L-VQE outperformed a fixed-ansatz VQE on 9 of 10 instances.
