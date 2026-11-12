---
layout: post
title: Quantum reservoir computing for credit-card fraud detection
date: 2026-11-12
description: Joint Interdisciplinary Project with Quobly
tags: quantum-machine-learning reservoir-computing
categories: projects
thumbnail: assets/img/blog/qrc-fraud/blog_qrc_protocol.png
published: true
---

<blockquote class="box" data-label="TL;DR">
<ul>
<li><strong>The question.</strong> Could credit-card fraud detection be a near-term use case for quantum reservoir computing (QRC)? With Quobly, we benchmarked a sliding-window QRC on simulated card payments against classical baselines, in ideal simulation and on a pulse-level model of Quobly's silicon spin-qubit chips.</li>
<li><strong>The answer: not yet.</strong> The quantum reservoir does build a useful memory of a card's history, but after equal tuning, a classical reservoir of the same size beats it (0.59 vs 0.49 average precision on customer fraud).</li>
<li><strong>On hardware, shots are the bottleneck.</strong> The chip's noise costs little, but estimating the features from finite shots does: at 1,000 shots per decision, the model is already too slow for real-time payment authorisation (0.37 s), and too inaccurate to be useful.</li>
<li><strong>Two lessons beyond fraud.</strong> An apparent quantum edge only counts once the classical baselines have been tuned with the same care, and small quantum reservoirs are far cheaper to simulate than to run.</li>
</ul>
</blockquote>

Quantum hardware companies are making steady progress on their roadmaps. But fault-tolerant quantum computers (FTQC) are still some way off, and it is unclear what practical value today's noisy intermediate-scale quantum (NISQ) devices can bring.

As part of our TU Delft Joint Interdisciplinary Project,[^jip] my teammates[^team] and I were asked by [Quobly](https://quobly.io), a French start-up building silicon spin-qubit quantum computers, to test whether credit-card fraud detection could be a viable NISQ use case for quantum reservoir computing (QRC).

Over ten weeks, we first framed the problem: what would a payment company need from a fraud detector? We then tested whether QRC could deliver it, in ideal simulation and on a model of Quobly's hardware, comparing its detection performance and its cost in time and energy with classical baselines. Along the way, we studied the design choices that matter for an actual implementation.

This post presents some of our findings, mostly on the quantum machine learning (QML) side, which is where I contributed most. A shorter overview is on the [project page]({% link _projects/jip-quantum-reservoir-computing.md %}).

## The use case: credit-card fraud detection

We focused on credit-card fraud, where someone other than the cardholder uses a stolen, lost or otherwise misused card. The stakes are high: in the Netherlands alone, 514,000 fraudulent card payments were reported in 2025 (up more than a quarter from 2024), totalling €41 million.[^dnb]

<figure class="usecase-fig">
<style>
.usecase-fig svg { width: 100%; max-width: 600px; height: auto; display: block; margin: 0 auto; }
.usecase-fig .band { fill: var(--global-code-bg-color, #f4f4f5); }
.usecase-fig .axis { stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1; }
.usecase-fig .past { fill: var(--edge-strong-color, #a1a1aa); }
.usecase-fig .now { fill: var(--global-bg-color, #ffffff); stroke: var(--global-text-color, #09090b); stroke-width: 2; }
.usecase-fig .flow { stroke: var(--global-text-color, #09090b); stroke-width: 1.5; fill: none; }
.usecase-fig .head { fill: var(--global-text-color, #09090b); }
.usecase-fig .ok { fill: none; stroke: var(--global-text-color, #09090b); stroke-width: 2; }
.usecase-fig .fraud { fill: #dc2626; }
html[data-theme="dark"] .usecase-fig .fraud { fill: #f87171; }
.usecase-fig text { font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif; font-size: 13px; fill: var(--global-text-color-light, #71717a); }
</style>
<svg viewBox="0 0 600 140" role="img" aria-label="A card's past payments form the context for a new payment, which is classified as genuine or fraud">
<defs><marker id="uc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="head" d="M0,0 L10,5 L0,10 z"/></marker></defs>
<rect class="band" x="24" y="45" width="262" height="50" rx="25"/>
<line class="axis" x1="24" y1="70" x2="330" y2="70"/>
<circle class="past" cx="50" cy="70" r="6"/>
<circle class="past" cx="92" cy="70" r="6"/>
<circle class="past" cx="134" cy="70" r="6"/>
<circle class="past" cx="176" cy="70" r="6"/>
<circle class="past" cx="218" cy="70" r="6"/>
<circle class="past" cx="260" cy="70" r="6"/>
<circle class="now" cx="330" cy="70" r="12"/>
<path class="flow" d="M352,70 H410 C440,70 440,34 476,34" marker-end="url(#uc-arrow)"/>
<path class="flow" d="M410,70 C440,70 440,106 476,106" marker-end="url(#uc-arrow)"/>
<circle class="ok" cx="496" cy="34" r="10"/>
<circle class="fraud" cx="496" cy="106" r="10"/>
<text x="155" y="122" text-anchor="middle">context</text>
<text x="330" y="122" text-anchor="middle">new</text>
<text x="516" y="38.5">genuine</text>
<text x="516" y="110.5">fraud</text>
</svg>
<figcaption class="caption">Our problem: given a new payment and the card's recent history, decide whether the payment is genuine or fraudulent.</figcaption>
</figure>

Payment companies typically check for fraud at two stages. At authorisation, the decision must be made in real time, within a few hundred milliseconds at most, while the cardholder waits at the checkout.[^latency] After authorisation, payments can be reviewed in near real time or offline, with more data, heavier models and human investigators.[^fds]

At either stage, the detector has to run on every payment, but only a tiny share of them are fraudulent. With an average fraudulent card payment of about €80 and roughly 7 frauds per 100,000 payments, fraud costs about €0.006 per payment checked.[^avg] That gives an order of magnitude for what a single decision can cost in compute and energy.

Now, detecting credit-card fraud is hard for three main reasons. First, as we just saw, it's an extremely rare event. Second, the signal often lies not in the payment itself but in its context, i.e. the recent history of the card or payment terminal. Third, fraudsters adapt, so fraud patterns change over time and a model trained on past fraud slowly goes stale.

When it comes to the metrics of interest, accuracy is meaningless with such a class imbalance: a model that never flags anything is 99.99% accurate. What matters is the trade-off between missed fraud and false positives, which are costly too: a legitimate customer whose card is declined at checkout feels wrongly suspected, and the merchant may lose the sale. In 2022, such false declines cost merchants an estimated $50.7 billion in the US, UK, France and Germany alone.[^declines] The precision-recall curve captures this trade-off, and we compared models with average precision (AP), which summarises it in a single number without fixing a decision threshold.

Today, payment companies mostly use gradient-boosted decision trees (GBDT), such as XGBoost, on engineered features like a card's rolling spending averages.[^gbdt] They are fast, and their scores can be explained (e.g. with SHAP).[^shap] Sequence models such as recurrent neural networks learn from a card's history directly,[^rnn] and graph neural networks can link fraud across cards.[^gnn]

Real payment data is confidential, and none of the public datasets we found combines fraud labels, card IDs and timestamps. The popular Kaggle dataset,[^kaggle] for example, has anonymised features and no card IDs, so a card's history can't be rebuilt from it. We therefore generated synthetic payments with the simulator of the _Fraud Detection Handbook_,[^handbook] with fraud injected by three scenarios:

- **Amount fraud:** every payment above a fixed amount (€220) is fraudulent.
- **Terminal fraud:** a compromised terminal makes its payments fraudulent for 28 days.
- **Customer fraud:** for 14 days after a card is compromised, a third of its payments, chosen at random, are multiplied by five in amount and are fraudulent.

<figure class="scen-fig">
<style>
.scen-fig svg { width: 100%; max-width: 720px; height: auto; display: block; margin: 0 auto; }
.scen-fig .lg { fill: var(--edge-strong-color, #a1a1aa); }
.scen-fig .fr { fill: #dc2626; }
html[data-theme="dark"] .scen-fig .fr { fill: #f87171; }
.scen-fig .win { fill: var(--global-code-bg-color, #f4f4f5); }
.scen-fig .axis { stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1; }
.scen-fig .thr { stroke: var(--global-text-color, #09090b); stroke-width: 1.2; stroke-dasharray: 4 3; }
.scen-fig text { font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif; font-size: 14px; fill: var(--global-text-color-light, #71717a); }
.scen-fig text.sm { font-size: 12px; }
</style>
<svg viewBox="0 0 720 170" role="img" aria-label="Three fraud scenarios: payments above an amount threshold of €220; all payments at a compromised terminal for 28 days; a third of a compromised card's payments, five times larger, for 14 days">
<rect class="lg" x="23" y="106" width="8" height="22" rx="1.5"/>
<rect class="lg" x="38" y="93" width="8" height="35" rx="1.5"/>
<rect class="lg" x="53" y="110" width="8" height="18" rx="1.5"/>
<rect class="lg" x="68" y="88" width="8" height="40" rx="1.5"/>
<rect class="fr" x="83" y="54" width="8" height="74" rx="1.5"/>
<rect class="lg" x="98" y="100" width="8" height="28" rx="1.5"/>
<rect class="lg" x="113" y="98" width="8" height="30" rx="1.5"/>
<rect class="lg" x="128" y="113" width="8" height="15" rx="1.5"/>
<rect class="lg" x="143" y="90" width="8" height="38" rx="1.5"/>
<rect class="fr" x="158" y="44" width="8" height="84" rx="1.5"/>
<rect class="lg" x="173" y="103" width="8" height="25" rx="1.5"/>
<rect class="lg" x="188" y="95" width="8" height="33" rx="1.5"/>
<line class="thr" x1="16" y1="68" x2="204" y2="68"/>
<text class="sm" x="16" y="62">€220</text>
<rect class="win" x="290" y="30" width="121" height="98" rx="4"/>
<text class="sm" x="350.5" y="22" text-anchor="middle">28 days</text>
<rect class="lg" x="263" y="98" width="8" height="30" rx="1.5"/>
<rect class="lg" x="278" y="108" width="8" height="20" rx="1.5"/>
<rect class="fr" x="293" y="92" width="8" height="36" rx="1.5"/>
<rect class="fr" x="308" y="104" width="8" height="24" rx="1.5"/>
<rect class="fr" x="323" y="100" width="8" height="28" rx="1.5"/>
<rect class="fr" x="338" y="110" width="8" height="18" rx="1.5"/>
<rect class="fr" x="353" y="94" width="8" height="34" rx="1.5"/>
<rect class="fr" x="368" y="102" width="8" height="26" rx="1.5"/>
<rect class="fr" x="383" y="106" width="8" height="22" rx="1.5"/>
<rect class="fr" x="398" y="96" width="8" height="32" rx="1.5"/>
<rect class="lg" x="413" y="109" width="8" height="19" rx="1.5"/>
<rect class="lg" x="428" y="101" width="8" height="27" rx="1.5"/>
<rect class="win" x="560" y="30" width="61" height="98" rx="4"/>
<text class="sm" x="590.5" y="22" text-anchor="middle">14 days</text>
<rect class="lg" x="503" y="102" width="8" height="26" rx="1.5"/>
<rect class="lg" x="518" y="96" width="8" height="32" rx="1.5"/>
<rect class="lg" x="533" y="108" width="8" height="20" rx="1.5"/>
<rect class="lg" x="548" y="98" width="8" height="30" rx="1.5"/>
<rect class="lg" x="563" y="110" width="8" height="18" rx="1.5"/>
<rect class="fr" x="578" y="38" width="8" height="90" rx="1.5"/>
<rect class="lg" x="593" y="104" width="8" height="24" rx="1.5"/>
<rect class="fr" x="608" y="48" width="8" height="80" rx="1.5"/>
<rect class="lg" x="623" y="94" width="8" height="34" rx="1.5"/>
<rect class="lg" x="638" y="106" width="8" height="22" rx="1.5"/>
<rect class="lg" x="653" y="100" width="8" height="28" rx="1.5"/>
<rect class="lg" x="668" y="97" width="8" height="31" rx="1.5"/>
<line class="axis" x1="16" y1="128.5" x2="204" y2="128.5"/>
<text x="110.0" y="154" text-anchor="middle">amount</text>
<line class="axis" x1="256" y1="128.5" x2="444" y2="128.5"/>
<text x="350.0" y="154" text-anchor="middle">terminal</text>
<line class="axis" x1="496" y1="128.5" x2="684" y2="128.5"/>
<text x="590.0" y="154" text-anchor="middle">customer</text>
</svg>
<figcaption class="caption">Each bar is a payment, in time order, and its height is the amount. Red payments are fraudulent.</figcaption>
</figure>

We decided to focus on customer fraud, whose signal lies in the card's own history: since QRC is supposed to bring memory, we built our models' input from the card's recent payments. Amount fraud needs only the current payment, and terminal fraud would need the terminal's history instead.

## The approach: quantum reservoir computing

Reservoir computing (RC) starts from a simple observation: to process a time series, you don't need to train a recurrent model. You can drive a fixed, untrained dynamical system, the _reservoir_, with the input sequence, read out its state, and train only a linear model on top. Usually, a good reservoir does two things: it remembers recent inputs while gradually forgetting older ones (_fading memory_), and it mixes them nonlinearly. One famous classical form is the echo state network (ESN), a random recurrent neural network whose weights are never trained.[^esn]

Quantum reservoir computing (QRC) replaces this network with a small quantum system.[^fujii] Inputs are written into some of its qubits, the system evolves, and the expectation values of a set of observables form the features. The hope is that a few qubits, with their exponentially large state space, give a rich feature map, and that training stays as cheap as fitting a linear model. Since nothing in the quantum part is trained, NISQ hardware might already do the job.

<figure class="rc-fig">
<style>
.rc-fig svg { width: 100%; max-width: 720px; height: auto; display: block; margin: 0 auto; }
.rc-fig .band { fill: var(--global-code-bg-color, #f4f4f5); }
.rc-fig .edge { stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1; fill: none; }
.rc-fig .node { fill: var(--global-bg-color, #ffffff); stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1.2; }
.rc-fig .enc { fill: #eff6ff; stroke: #2563eb; stroke-width: 1.2; }
.rc-fig .acc { fill: #2563eb; }
.rc-fig .feat { fill: var(--global-code-bg-color, #f4f4f5); stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1; }
.rc-fig .now { fill: var(--global-bg-color, #ffffff); stroke: var(--global-text-color, #09090b); stroke-width: 2; }
.rc-fig .flow { stroke: var(--global-text-color, #09090b); stroke-width: 1.5; fill: none; }
.rc-fig .feed { stroke: #2563eb; stroke-width: 1.2; fill: none; opacity: 0.7; }
.rc-fig .head { fill: var(--global-text-color, #09090b); }
.rc-fig .head-l { fill: #2563eb; }
html[data-theme="dark"] .rc-fig .head-l, html[data-theme="dark"] .rc-fig .acc { fill: #60a5fa; }
html[data-theme="dark"] .rc-fig .enc { fill: rgba(96, 165, 250, 0.12); stroke: #60a5fa; }
html[data-theme="dark"] .rc-fig .feed { stroke: #60a5fa; }
.rc-fig text { font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif; font-size: 13px; fill: var(--global-text-color-light, #71717a); }
.rc-fig text.sm { font-size: 12px; }
.rc-fig text.dk { fill: var(--global-text-color, #09090b); }
.rc-fig text.it { font-style: italic; }
.rc-fig text.ac { fill: #2563eb; }
html[data-theme="dark"] .rc-fig text.ac { fill: #60a5fa; }
.rc-fig .train { fill: #fff7ed; stroke: #ea580c; stroke-width: 2; }
.rc-fig .brk { stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1.2; fill: none; }
.rc-fig .brk-t { stroke: #ea580c; stroke-width: 1.5; fill: none; }
.rc-fig text.or { fill: #ea580c; font-weight: 600; }
html[data-theme="dark"] .rc-fig .train { fill: rgba(251, 146, 60, 0.12); stroke: #fb923c; }
html[data-theme="dark"] .rc-fig .brk-t { stroke: #fb923c; }
html[data-theme="dark"] .rc-fig text.or { fill: #fb923c; }
</style>
<svg viewBox="0 0 720 256" role="img" aria-label="(Quantum) reservoir computing: an input sequence drives a fixed, untrained (quantum) reservoir; features read out from its state feed a linear readout, the only trained part, which produces the output.">
<defs><marker id="rc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="head" d="M0,0 L10,5 L0,10 z"/></marker>
<marker id="rc-arrow-l" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="head-l" d="M0,0 L10,5 L0,10 z"/></marker></defs>
<rect class="band" x="14" y="88" width="152" height="44" rx="22"/>
<circle class="acc" cx="36" cy="110" r="6"/>
<circle class="acc" cx="62" cy="110" r="6"/>
<circle class="acc" cx="88" cy="110" r="6"/>
<circle class="acc" cx="114" cy="110" r="6"/>
<circle class="acc" cx="140" cy="110" r="6"/>
<text class="ac it" x="90" y="76" text-anchor="middle">x<tspan class="sm" dy="3.5" font-style="normal">1</tspan><tspan dy="-3.5" font-style="normal">, …,&#160;</tspan>x<tspan class="sm" dy="3.5" font-style="normal">t</tspan></text>
<text x="90" y="154" text-anchor="middle">input sequence</text>
<rect class="band" x="232" y="34" width="208" height="152" rx="18"/>
<path class="feed" d="M150,110 H196 C222,110 226,70 257,70" marker-end="url(#rc-arrow-l)"/>
<path class="feed" d="M196,110 C222,110 226,150 255,150" marker-end="url(#rc-arrow-l)"/>
<text class="dk" x="336" y="24" text-anchor="middle">(quantum) reservoir</text>
<line class="edge" x1="268" y1="70" x2="330" y2="56"/>
<line class="edge" x1="268" y1="70" x2="338" y2="112"/>
<line class="edge" x1="268" y1="70" x2="266" y2="150"/>
<line class="edge" x1="266" y1="150" x2="338" y2="112"/>
<line class="edge" x1="266" y1="150" x2="324" y2="164"/>
<line class="edge" x1="330" y1="56" x2="338" y2="112"/>
<line class="edge" x1="330" y1="56" x2="402" y2="74"/>
<line class="edge" x1="338" y1="112" x2="402" y2="74"/>
<line class="edge" x1="338" y1="112" x2="404" y2="146"/>
<line class="edge" x1="324" y1="164" x2="404" y2="146"/>
<line class="edge" x1="402" y1="74" x2="404" y2="146"/>
<circle class="enc" cx="268" cy="70" r="9"/>
<circle class="enc" cx="266" cy="150" r="9"/>
<circle class="node" cx="330" cy="56" r="9"/>
<circle class="node" cx="338" cy="112" r="9"/>
<circle class="node" cx="324" cy="164" r="9"/>
<circle class="node" cx="402" cy="74" r="9"/>
<circle class="node" cx="404" cy="146" r="9"/>
<path class="flow" d="M448,110 H470" marker-end="url(#rc-arrow)"/>
<rect class="feat" x="476" y="68" width="14" height="14"/>
<rect class="feat" x="476" y="82" width="14" height="14"/>
<rect class="feat" x="476" y="96" width="14" height="14"/>
<rect class="feat" x="476" y="110" width="14" height="14"/>
<rect class="feat" x="476" y="124" width="14" height="14"/>
<rect class="feat" x="476" y="138" width="14" height="14"/>
<text class="dk" x="483" y="58" text-anchor="middle">⟨<tspan class="it">O</tspan><tspan class="sm it" dy="3.5">k</tspan><tspan dy="-3.5">⟩</tspan></text>
<text class="sm" x="483" y="172" text-anchor="middle">features</text>
<path class="flow" d="M496,110 H512" marker-end="url(#rc-arrow)"/>
<rect class="train" x="518" y="84" width="100" height="52" rx="6"/>
<text class="dk" x="568" y="106" text-anchor="middle">linear</text><text class="dk" x="568" y="123" text-anchor="middle">readout</text>
<path class="flow" d="M622,110 H652" marker-end="url(#rc-arrow)"/>
<text class="dk it" x="662" y="114.5">y<tspan class="sm" dy="3.5" font-style="normal">t</tspan></text>
<text class="sm" x="662" y="140">output</text>
<path class="brk" d="M232,208 V214 H496 V208"/>
<text x="364" y="236" text-anchor="middle">fixed, never trained</text>
<path class="brk-t" d="M518,208 V214 H618 V208"/>
<text class="or" x="568" y="236" text-anchor="middle">trained</text>
</svg>
<figcaption class="caption">(Quantum) reservoir computing: the input sequence drives a fixed reservoir, and only the linear readout (orange) is trained. In QRC, the reservoir is a quantum system and its features are expectation values of observables, ⟨<em>O</em><sub><em>k</em></sub>⟩.</figcaption>
</figure>

QRC has been proposed on many platforms, from nuclear spins and Rydberg atoms to photonics and superconducting qubits, both as continuous-time dynamics and as gate-based circuits.[^mujal21] On gate-based hardware, one difficulty dominates: measuring the qubits destroys their state, so the reservoir can't be measured after each input and then carry on. Proposed solutions include weak measurements and rerunning the past inputs before each measurement.[^mujal23]

We chose a variant of the second option. For each transaction, the reservoir starts from scratch and processes the card's last L transactions, ending with the one to classify. Each prediction is then independent, and the task becomes standard supervised learning. With L = 1, there is no memory left, and this reduces to a quantum extreme learning machine (QELM): a fixed quantum feature map applied to one input at a time.[^qelm]

<figure class="proto-fig">
<style>
.proto-fig svg { width: 100%; max-width: 792px; height: auto; display: block; margin: 0 auto; }
.proto-fig .band { fill: var(--global-code-bg-color, #f4f4f5); }
.proto-fig .axis { stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1; fill: none; }
.proto-fig .past { fill: var(--edge-strong-color, #a1a1aa); }
.proto-fig .other { fill: var(--global-bg-color, #ffffff); stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1; }
.proto-fig .now { fill: var(--global-bg-color, #ffffff); stroke: var(--global-text-color, #09090b); stroke-width: 2; }
.proto-fig .gate { fill: var(--global-bg-color, #ffffff); stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1; }
.proto-fig .uni { fill: var(--global-code-bg-color, #f4f4f5); stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1; }
.proto-fig .feat { fill: var(--global-code-bg-color, #f4f4f5); stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1; }
.proto-fig .flow { stroke: var(--global-text-color, #09090b); stroke-width: 1.5; fill: none; }
.proto-fig .feed { stroke: #2563eb; stroke-width: 1.2; fill: none; opacity: 0.7; }
.proto-fig .meter { stroke: var(--global-text-color, #09090b); stroke-width: 1.2; fill: none; }
.proto-fig .head { fill: var(--global-text-color, #09090b); }
.proto-fig .head-l { fill: #2563eb; }
.proto-fig .acc { fill: #2563eb; }
.proto-fig .enc { fill: #eff6ff; stroke: #2563eb; stroke-width: 1.2; }
.proto-fig .dot { fill: var(--edge-strong-color, #a1a1aa); }
html[data-theme="dark"] .proto-fig .head-l, html[data-theme="dark"] .proto-fig .acc { fill: #60a5fa; }
html[data-theme="dark"] .proto-fig .enc { fill: rgba(96, 165, 250, 0.12); stroke: #60a5fa; }
html[data-theme="dark"] .proto-fig .feed { stroke: #60a5fa; }
.proto-fig text { font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif; font-size: 13px; fill: var(--global-text-color-light, #71717a); }
.proto-fig text.sm { font-size: 12px; }
.proto-fig text.dk { fill: var(--global-text-color, #09090b); }
.proto-fig text.it { font-style: italic; }
.proto-fig text.ac { fill: #2563eb; }
html[data-theme="dark"] .proto-fig text.ac { fill: #60a5fa; }
</style>
<svg viewBox="0 0 792 340" role="img" aria-label="Sliding-window QRC: for each transaction, the card's last L transactions are fed one per layer into a fresh qubit register (reset input qubits, encode, evolve the whole register); the register is measured once at the end and a logistic regression turns the expectation values into a fraud score.">
<defs><marker id="pr-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="head" d="M0,0 L10,5 L0,10 z"/></marker>
<marker id="pr-arrow-l" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="head-l" d="M0,0 L10,5 L0,10 z"/></marker></defs>
<rect class="band" x="200" y="34" width="366" height="44" rx="22"/>
<text x="382" y="26" text-anchor="middle">card A’s last L = 4 payments</text>
<line class="axis" x1="96" y1="56" x2="572" y2="56"/>
<circle class="acc" cx="112" cy="56" r="6"/>
<circle class="other" cx="148" cy="56" r="4"/>
<circle class="other" cx="184" cy="56" r="4"/>
<circle class="acc" cx="220" cy="56" r="6"/>
<circle class="other" cx="256" cy="56" r="4"/>
<circle class="other" cx="292" cy="56" r="4"/>
<circle class="other" cx="328" cy="56" r="4"/>
<circle class="acc" cx="364" cy="56" r="6"/>
<circle class="other" cx="400" cy="56" r="4"/>
<circle class="acc" cx="436" cy="56" r="6"/>
<circle class="other" cx="472" cy="56" r="4"/>
<circle class="other" cx="508" cy="56" r="4"/>
<circle class="now" cx="544" cy="56" r="10"/>
<circle class="acc" cx="612" cy="36" r="6"/><text class="sm" x="626" y="40">card A</text>
<circle class="other" cx="612" cy="56" r="4"/><text class="sm" x="626" y="60">other cards</text>
<circle class="now" cx="612" cy="77" r="7"/><text class="sm" x="626" y="81">to classify</text>
<line class="axis" x1="94" y1="146" x2="584" y2="146"/>
<text class="sm" x="88" y="150" text-anchor="end">|0⟩</text>
<line class="axis" x1="94" y1="184" x2="584" y2="184"/>
<text class="sm" x="88" y="188" text-anchor="end">|0⟩</text>
<line class="axis" x1="94" y1="226" x2="584" y2="226"/>
<text class="sm" x="88" y="230" text-anchor="end">|0⟩</text>
<line class="axis" x1="94" y1="264" x2="584" y2="264"/>
<text class="sm" x="88" y="268" text-anchor="end">|0⟩</text>
<line class="axis" x1="58" y1="134" x2="58" y2="196"/><text x="52" y="169.5" text-anchor="end">input</text>
<line class="axis" x1="58" y1="214" x2="58" y2="276"/><text x="52" y="249.5" text-anchor="end">memory</text>
<circle class="dot" cx="80" cy="160.0" r="1.3"/>
<circle class="dot" cx="80" cy="165.0" r="1.3"/>
<circle class="dot" cx="80" cy="170.0" r="1.3"/>
<circle class="dot" cx="600" cy="160.0" r="1.3"/>
<circle class="dot" cx="600" cy="165.0" r="1.3"/>
<circle class="dot" cx="600" cy="170.0" r="1.3"/>
<circle class="dot" cx="80" cy="240.0" r="1.3"/>
<circle class="dot" cx="80" cy="245.0" r="1.3"/>
<circle class="dot" cx="80" cy="250.0" r="1.3"/>
<circle class="dot" cx="600" cy="240.0" r="1.3"/>
<circle class="dot" cx="600" cy="245.0" r="1.3"/>
<circle class="dot" cx="600" cy="250.0" r="1.3"/>
<rect class="gate" x="100" y="134" width="22" height="62" rx="4"/>
<text class="sm" x="111.0" y="169" text-anchor="middle">|0⟩</text>
<rect class="enc" x="134" y="134" width="36" height="62" rx="4"/>
<text class="ac it" x="151.0" y="169" text-anchor="middle">x<tspan class="sm" dy="3.5" font-style="normal">t−3</tspan></text>
<rect class="uni" x="185" y="122" width="24" height="156" rx="4"/>
<text class="dk it" x="197.0" y="204.5" text-anchor="middle">U</text>
<path class="feed" d="M220,64 C220,106 152.0,96 152.0,130" marker-end="url(#pr-arrow-l)"/>
<rect class="gate" x="221" y="134" width="22" height="62" rx="4"/>
<text class="sm" x="232.0" y="169" text-anchor="middle">|0⟩</text>
<rect class="enc" x="255" y="134" width="36" height="62" rx="4"/>
<text class="ac it" x="272.0" y="169" text-anchor="middle">x<tspan class="sm" dy="3.5" font-style="normal">t−2</tspan></text>
<rect class="uni" x="306" y="122" width="24" height="156" rx="4"/>
<text class="dk it" x="318.0" y="204.5" text-anchor="middle">U</text>
<path class="feed" d="M364,64 C364,106 273.0,96 273.0,130" marker-end="url(#pr-arrow-l)"/>
<rect class="gate" x="342" y="134" width="22" height="62" rx="4"/>
<text class="sm" x="353.0" y="169" text-anchor="middle">|0⟩</text>
<rect class="enc" x="376" y="134" width="36" height="62" rx="4"/>
<text class="ac it" x="393.0" y="169" text-anchor="middle">x<tspan class="sm" dy="3.5" font-style="normal">t−1</tspan></text>
<rect class="uni" x="427" y="122" width="24" height="156" rx="4"/>
<text class="dk it" x="439.0" y="204.5" text-anchor="middle">U</text>
<path class="feed" d="M436,64 C436,106 394.0,96 394.0,130" marker-end="url(#pr-arrow-l)"/>
<rect class="gate" x="463" y="134" width="22" height="62" rx="4"/>
<text class="sm" x="474.0" y="169" text-anchor="middle">|0⟩</text>
<rect class="enc" x="497" y="134" width="36" height="62" rx="4"/>
<text class="ac it" x="514.0" y="169" text-anchor="middle">x<tspan class="sm" dy="3.5" font-style="normal">t</tspan></text>
<rect class="uni" x="548" y="122" width="24" height="156" rx="4"/>
<text class="dk it" x="560.0" y="204.5" text-anchor="middle">U</text>
<path class="feed" d="M544,68 C544,106 515.0,96 515.0,130" marker-end="url(#pr-arrow-l)"/>
<text class="sm" x="111.0" y="296" text-anchor="middle">reset</text>
<text class="sm" x="152.0" y="296" text-anchor="middle">encode</text>
<text class="sm" x="197.0" y="296" text-anchor="middle">evolve</text>
<path class="axis" d="M100,308 V313 H572 V308"/>
<text class="sm" x="336" y="331" text-anchor="middle">one layer per payment, on a fresh register for every window and every shot</text>
<rect class="gate" x="588" y="136" width="24" height="20" rx="3"/>
<path class="meter" d="M593,151 A7,7 0 0 1 607,151"/><line class="meter" x1="600" y1="151" x2="606" y2="141"/>
<rect class="gate" x="588" y="174" width="24" height="20" rx="3"/>
<path class="meter" d="M593,189 A7,7 0 0 1 607,189"/><line class="meter" x1="600" y1="189" x2="606" y2="179"/>
<rect class="gate" x="588" y="216" width="24" height="20" rx="3"/>
<path class="meter" d="M593,231 A7,7 0 0 1 607,231"/><line class="meter" x1="600" y1="231" x2="606" y2="221"/>
<rect class="gate" x="588" y="254" width="24" height="20" rx="3"/>
<path class="meter" d="M593,269 A7,7 0 0 1 607,269"/><line class="meter" x1="600" y1="269" x2="606" y2="259"/>
<path class="flow" d="M620,205 H638" marker-end="url(#pr-arrow)"/>
<rect class="feat" x="644" y="163" width="14" height="14"/>
<rect class="feat" x="644" y="177" width="14" height="14"/>
<rect class="feat" x="644" y="191" width="14" height="14"/>
<rect class="feat" x="644" y="205" width="14" height="14"/>
<rect class="feat" x="644" y="219" width="14" height="14"/>
<rect class="feat" x="644" y="233" width="14" height="14"/>
<text class="dk" x="651" y="153" text-anchor="middle">⟨<tspan class="it">O</tspan><tspan class="sm it" dy="3.5">k</tspan><tspan dy="-3.5">⟩</tspan></text>
<text class="sm" x="651" y="267" text-anchor="middle">features</text>
<path class="flow" d="M664,205 H678" marker-end="url(#pr-arrow)"/>
<rect class="now" x="684" y="179" width="100" height="52" rx="6"/>
<text class="dk" x="734" y="201" text-anchor="middle">logistic</text><text class="dk" x="734" y="218" text-anchor="middle">regression</text>
<text class="sm" x="734" y="169" text-anchor="middle">only trained part</text>
<path class="flow" d="M734,233 V257" marker-end="url(#pr-arrow)"/>
<text class="dk" x="734" y="277" text-anchor="middle">fraud score</text>
</svg>
<figcaption class="caption">For each transaction, a fresh register processes the card's last L transactions, one layer each (reset the input qubits, encode, evolve), and is measured once at the end. A logistic regression on the resulting expectation values gives the fraud score.</figcaption>
</figure>

The qubit register is split into _input qubits_, which receive the data, and _memory qubits_, which never do. Starting from all qubits in \|0⟩, each transaction of the window is processed in three steps:

1. **Reset.** The input qubits are reset to \|0⟩, while the memory qubits are left untouched.
2. **Encoding.** The transaction's features are written onto the input qubits with single-qubit rotations.
3. **Evolution.** The whole register evolves under a fixed unitary, either a random circuit or a Hamiltonian evolution. This is how information flows from the input qubits into the memory qubits, and how successive transactions get mixed.

After the last transaction, we measure a fixed set of observables. Their expectation values, estimated on hardware from repeated runs (_shots_), are the features fed to a logistic regression, which is the only trained part of the model. Which observables we measure turns out to matter a lot, as we'll see in the results.

We implemented everything as an [<i class="fa-brands fa-github"></i> open-source Python package](https://github.com/zulee1711/cc_fraud_detection_using_QRC), with a command-line interface to run every experiment. The same circuits can be run with exact expectation values (Qiskit Aer, or a fast NumPy simulator for small systems), with simulated shot noise, or at pulse level on a model of Quobly's chips with SpinPulse.[^spinpulse]

The package also implements three classical baselines, which see exactly the same windows:

- **Logistic regression on the raw window:** the same linear readout, without a reservoir. Whatever the QRC gains over it is the reservoir's contribution.
- **ESN of equal width:** a classical reservoir with as many features as the QRC has observables. It tests whether the reservoir needs to be quantum.
- **Long Short-Term Memory (LSTM):** a trained recurrent network.[^lstm] It gives a realistic reference for what can be extracted from the window, but the comparison with QRC is not like-for-like.

## Results

In this section, we present our main results: a comparison of our quantum model with classical baselines, an investigation into its memory, and an analysis of what running it on a real chip would cost.

### Setup

In the experiments below, each transaction is described by a single feature: the log of its amount. Indeed, our point was to test whether the quantum reservoir builds its own memory of the card's history, without engineered history features, and the other raw features added no signal for customer fraud. Taking the log spreads the skewed amounts over the encoding range, and turns the ×5 amount of a customer-fraud payment into roughly the same shift for every card.

This feature is encoded on one input qubit, accompanied by three memory qubits. The reservoir evolves under a trotterised (two steps) transverse-field Ising model (TFIM) Hamiltonian, and the readout measures 45 Pauli strings: all X-, Y- and Z-type strings on the four qubits, which we call the XYZ-string readout. Unless stated otherwise, results use this readout and exact expectation values, and we report the AP on customer fraud (customer AP) on the test period, averaged over 10 reservoir seeds. Because four-qubit systems were small enough to be simulated with our NumPy backend, each run took a few minutes on a laptop.

The dataset has 1,000 simulated customers over one year (692,000 transactions), split chronologically into training, validation and test periods. To get enough customer fraud at this size, we compromised cards at ten times the Handbook's per-customer rate: 85% of customers are compromised at least once during the year. Fraud makes up 3.3% of transactions, and customer fraud 1.3%.

<figure class="split-fig">
<style>
.split-fig svg { width: 100%; max-width: 720px; height: auto; display: block; margin: 0 auto; }
.split-fig .train { fill: var(--global-code-bg-color, #f4f4f5); stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1; }
.split-fig .val { fill: var(--global-bg-color, #ffffff); stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1; stroke-dasharray: 4 3; }
.split-fig .test { fill: var(--global-bg-color, #ffffff); stroke: var(--global-text-color, #09090b); stroke-width: 2; }
.split-fig .flow { stroke: var(--global-text-color, #09090b); stroke-width: 1.5; fill: none; }
.split-fig .head { fill: var(--global-text-color, #09090b); }
.split-fig text { font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif; font-size: 13px; fill: var(--global-text-color-light, #71717a); }
.split-fig text.sm { font-size: 12px; }
.split-fig text.dk { fill: var(--global-text-color, #09090b); }
</style>
<svg viewBox="0 0 720 108" role="img" aria-label="Chronological split of one simulated year: 255 days of training, then 54 days of validation, then 56 days of test.">
<defs><marker id="sp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="head" d="M0,0 L10,5 L0,10 z"/></marker></defs>
<text class="sm" x="24" y="20">one simulated year: 1,000 customers, 692,000 transactions</text>
<path class="flow" d="M640,16 H695" marker-end="url(#sp-arrow)"/>
<text class="sm" x="632" y="20" text-anchor="end">time</text>
<rect class="train" x="24" y="32" width="468" height="40" rx="6"/>
<rect class="val" x="496" y="32" width="96" height="40" rx="6"/>
<rect class="test" x="596" y="32" width="100" height="40" rx="6"/>
<text class="dk" x="258" y="56.5" text-anchor="middle">training</text>
<text class="dk" x="544" y="56.5" text-anchor="middle">validation</text>
<text class="dk" x="646" y="56.5" text-anchor="middle">test</text>
<text class="sm" x="258" y="92" text-anchor="middle">255 days</text>
<text class="sm" x="544" y="92" text-anchor="middle">54 days</text>
<text class="sm" x="646" y="92" text-anchor="middle">56 days</text>
</svg>
<figcaption class="caption">The data are split by time, not at random: models are fitted on the training period, tuned on validation, and scored on test.</figcaption>
</figure>

### A negative outcome

At a window length of L = 15, after equal tuning (see below), the quantum reservoir does extract useful features: it beats logistic regression on the raw window. But a classical reservoir of the same width extracts more, and a trained LSTM far more.

<figure class="res-fig">
<style>
.res-fig svg { width: 100%; max-width: 720px; height: auto; display: block; margin: 0 auto; }
.res-fig .base { fill: var(--edge-strong-color, #a1a1aa); }
.res-fig .q { fill: #2563eb; }
.res-fig .c { fill: var(--global-text-color, #09090b); }
html[data-theme="dark"] .res-fig .q { fill: #60a5fa; }
.res-fig .axis { stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1; }
.res-fig .grid { stroke: var(--edge-color, #e4e4e7); stroke-width: 1; }
.res-fig .brk { stroke: var(--global-text-color, #09090b); stroke-width: 1.2; fill: none; }
.res-fig text { font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif; font-size: 13px; fill: var(--global-text-color-light, #71717a); }
.res-fig text.sm { font-size: 12px; }
.res-fig text.dk { fill: var(--global-text-color, #09090b); }
.res-fig text.b { font-weight: 600; }
</style>
<svg viewBox="0 0 720 200" role="img" aria-label="Customer-fraud results at L = 15. Average precision: logistic regression 0.41, tuned QRC 0.49, tuned ESN 0.59, LSTM 0.77. Fraud caught at 1% false alarms: 44%, 54%, 66%, 76%.">
<text class="sm" x="176" y="24">customer AP</text>
<text class="sm" x="506" y="24">fraud caught at 1% false alarms</text>
<line class="grid" x1="236.0" y1="36" x2="236.0" y2="172"/>
<text class="sm" x="236.0" y="190" text-anchor="middle">0.2</text>
<line class="grid" x1="296.0" y1="36" x2="296.0" y2="172"/>
<text class="sm" x="296.0" y="190" text-anchor="middle">0.4</text>
<line class="grid" x1="356.0" y1="36" x2="356.0" y2="172"/>
<text class="sm" x="356.0" y="190" text-anchor="middle">0.6</text>
<line class="grid" x1="416.0" y1="36" x2="416.0" y2="172"/>
<text class="sm" x="416.0" y="190" text-anchor="middle">0.8</text>
<line class="axis" x1="176" y1="36" x2="176" y2="172"/>
<line class="grid" x1="544.0" y1="36" x2="544.0" y2="172"/>
<text class="sm" x="544.0" y="190" text-anchor="middle">20%</text>
<line class="grid" x1="582.0" y1="36" x2="582.0" y2="172"/>
<text class="sm" x="582.0" y="190" text-anchor="middle">40%</text>
<line class="grid" x1="620.0" y1="36" x2="620.0" y2="172"/>
<text class="sm" x="620.0" y="190" text-anchor="middle">60%</text>
<line class="grid" x1="658.0" y1="36" x2="658.0" y2="172"/>
<text class="sm" x="658.0" y="190" text-anchor="middle">80%</text>
<line class="axis" x1="506" y1="36" x2="506" y2="172"/>
<text class="" x="166" y="58.5" text-anchor="end">Logistic regression</text>
<g><title>Logistic regression: AP 0.41</title><path class="base" d="M176,44 H295.0 Q299.0,44 299.0,48 V60 Q299.0,64 295.0,64 H176 Z"/></g>
<text class="dk" x="305.0" y="58.5">0.41</text>
<g><title>Logistic regression: 44% of customer fraud caught</title><path class="base" d="M506,44 H585.6 Q589.6,44 589.6,48 V60 Q589.6,64 585.6,64 H506 Z"/></g>
<text class="dk" x="595.6" y="58.5">44%</text>
<text class="dk b" x="166" y="92.5" text-anchor="end">QRC, tuned</text>
<g><title>QRC, tuned: AP 0.49</title><path class="q" d="M176,78 H319.0 Q323.0,78 323.0,82 V94 Q323.0,98 319.0,98 H176 Z"/></g>
<text class="dk b" x="329.0" y="92.5">0.49</text>
<g><title>QRC, tuned: 54% of customer fraud caught</title><path class="q" d="M506,78 H604.6 Q608.6,78 608.6,82 V94 Q608.6,98 604.6,98 H506 Z"/></g>
<text class="dk b" x="614.6" y="92.5">54%</text>
<text class="dk b" x="166" y="126.5" text-anchor="end">ESN (45 units), tuned</text>
<g><title>ESN (45 units), tuned: AP 0.59</title><path class="c" d="M176,112 H349.0 Q353.0,112 353.0,116 V128 Q353.0,132 349.0,132 H176 Z"/></g>
<text class="dk b" x="359.0" y="126.5">0.59</text>
<g><title>ESN (45 units), tuned: 66% of customer fraud caught</title><path class="c" d="M506,112 H627.4 Q631.4,112 631.4,116 V128 Q631.4,132 627.4,132 H506 Z"/></g>
<text class="dk b" x="637.4" y="126.5">66%</text>
<text class="" x="166" y="160.5" text-anchor="end">LSTM</text>
<g><title>LSTM: AP 0.77</title><path class="base" d="M176,146 H403.0 Q407.0,146 407.0,150 V162 Q407.0,166 403.0,166 H176 Z"/></g>
<text class="dk" x="413.0" y="160.5">0.77</text>
<g><title>LSTM: 76% of customer fraud caught</title><path class="base" d="M506,146 H646.4 Q650.4,146 650.4,150 V162 Q650.4,166 646.4,166 H506 Z"/></g>
<text class="dk" x="656.4" y="160.5">76%</text>
<path class="brk" d="M397.0,88 H403.0 V122 H397.0"/>
<text class="dk b" x="409.0" y="109.5">ESN +0.10</text>
</svg>
<figcaption class="caption">Customer-fraud results at L = 15, after equal tuning.</figcaption>
</figure>

The right panel translates these scores into operational terms: it shows the share of customer fraud caught when each model's threshold is set, on the validation period, to flag at most 1% of legitimate payments. Every model then raises about the same number of alerts, 60–70 per day, so the comparison is about how much fraud each one catches for the same workload: the QRC catches 10 points more customer fraud than logistic regression, but 12 points less than the ESN.

The LSTM result shows that the window contains far more information than either fixed reservoir, quantum or classical, exposes to a linear readout.

<blockquote class="box" data-label="Methodology">
<p><strong>Tune every model with equal care</strong></p>
<p markdown="span">With default settings, the QRC was ahead of the equal-width ESN by 0.031 AP at L = 15. But before claiming anything, we gave both models the same tuning budget: one Optuna study each,[^optuna] with 100 trials, tuning three parameters of the reservoir and its input encoding plus the readout regularisation, scored on the validation period. Tuning improved the QRC by 0.056 and the ESN by 0.189: the latter ended up ahead by 0.102, on all 10 seeds, including the 7 never used during tuning. Hence, the initial edge came from the default settings, not from the quantum reservoir.</p>
<figure class="tune-fig">
<style>
.tune-fig svg { width: 100%; max-width: 720px; height: auto; display: block; margin: 0 auto; }
.tune-fig .q { stroke: #2563eb; } .tune-fig .qf { fill: #2563eb; }
.tune-fig .c { stroke: var(--global-text-color, #09090b); } .tune-fig .cf { fill: var(--global-text-color, #09090b); }
html[data-theme="dark"] .tune-fig .q { stroke: #60a5fa; } html[data-theme="dark"] .tune-fig .qf { fill: #60a5fa; }
.tune-fig .ln { stroke-width: 2; fill: none; }
.tune-fig .ring { stroke: var(--global-code-bg-color, #f4f4f5); stroke-width: 2; }
.tune-fig .axis { stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1; }
.tune-fig .ref { stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1.2; stroke-dasharray: 4 3; }
.tune-fig text { font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif; font-size: 13px; fill: var(--global-text-color-light, #71717a); }
.tune-fig text.sm { font-size: 12px; }
.tune-fig text.dk { fill: var(--global-text-color, #09090b); }
.tune-fig text.b { font-weight: 600; }
</style>
<svg viewBox="0 0 720 250" role="img" aria-label="Effect of equal tuning. QRC goes from 0.43 to 0.49 average precision, the ESN from 0.40 to 0.59; logistic regression scores 0.41.">
<line class="axis" x1="270" y1="36" x2="270" y2="214"/>
<text x="270" y="236" text-anchor="middle">default settings</text>
<line class="axis" x1="470" y1="36" x2="470" y2="214"/>
<text x="470" y="236" text-anchor="middle">tuned, 100 trials each</text>
<line class="ref" x1="270" y1="180.4" x2="470" y2="180.4"/>
<text class="sm" x="482" y="184.4">logistic regression 0.41</text>
<g><title>QRC: 0.43 with default settings, 0.49 tuned</title><line class="ln q" x1="270" y1="169.8" x2="470" y2="138.4"/><circle class="qf ring" cx="270" cy="169.8" r="6"/><circle class="qf ring" cx="470" cy="138.4" r="6"/></g>
<text class="dk" x="256" y="174.3" text-anchor="end"><tspan class="b">QRC</tspan> 0.43</text>
<text class="dk" x="484" y="142.9"><tspan class="b">QRC</tspan> 0.49</text>
<g><title>ESN: 0.40 with default settings, 0.59 tuned</title><line class="ln c" x1="270" y1="187.1" x2="470" y2="81.3"/><circle class="cf ring" cx="270" cy="187.1" r="6"/><circle class="cf ring" cx="470" cy="81.3" r="6"/></g>
<text class="dk" x="256" y="191.6" text-anchor="end"><tspan class="b">ESN</tspan> 0.40</text>
<text class="dk" x="484" y="85.8"><tspan class="b">ESN</tspan> 0.59</text>
<text class="sm" x="370.0" y="20" text-anchor="middle">customer AP, test period</text>
</svg>
<figcaption class="caption">An apparent quantum edge turns out to be a tuning artefact. Means over 10 reservoir seeds.</figcaption>
</figure>
<p>Also, the tuned settings are telling: Optuna settled on a transverse field more than ten times weaker than the default (h = 0.08 instead of 1), with a shorter evolution time. Without its field, our TFIM reduces to commuting XX couplings. The best quantum reservoir found is therefore close to a commuting Ising-type model, with little of the non-commuting dynamics usually credited for the expressivity of QRC.</p>
</blockquote>

### Still, the reservoir does have memory

The QRC does not lose for lack of memory. With a single transaction (L = 1), every model reaches the same customer AP, about 0.15: there is no history to exploit. But with longer windows, the untuned TFIM reservoir keeps improving, up to L = 30. Logistic regression on the raw window improves too, though, and catches up by L = 30 (0.56 vs 0.54). Interestingly, a reservoir that evolves under a random circuit stops improving beyond L = 10.

<figure class="memL-fig">
<style>
.memL-fig svg { width: 100%; max-width: 720px; height: auto; display: block; margin: 0 auto; }
.memL-fig .axis { stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1; }
.memL-fig .grid { stroke: var(--edge-color, #e4e4e7); stroke-width: 1; }
.memL-fig .ref { stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1.5; stroke-dasharray: 5 4; fill: none; }
.memL-fig .q { stroke: #2563eb; } .memL-fig .qf { fill: #2563eb; }
.memL-fig .r { stroke: #0d9488; } .memL-fig .rf { fill: #0d9488; }
html[data-theme="dark"] .memL-fig .q { stroke: #60a5fa; } html[data-theme="dark"] .memL-fig .qf { fill: #60a5fa; }
.memL-fig .ln { stroke-width: 2; fill: none; }
.memL-fig .band { opacity: 0.14; }
.memL-fig .ring { stroke: var(--global-bg-color, #ffffff); stroke-width: 1.5; }
.memL-fig text { font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif; font-size: 13px; fill: var(--global-text-color-light, #71717a); }
.memL-fig text.sm { font-size: 12px; }
.memL-fig text.dk { fill: var(--global-text-color, #09090b); }
.memL-fig text.b { font-weight: 600; }
</style>
<svg viewBox="0 0 720 300" role="img" aria-label="Customer-fraud average precision against window length. TFIM reservoir: 0.14, 0.18, 0.24, 0.35, 0.43, 0.48, 0.54; random circuit: 0.14, 0.18, 0.25, 0.35, 0.35, 0.35, 0.35; logistic regression: 0.16, 0.17, 0.23, 0.33, 0.41, 0.47, 0.56, for L = 1, 3, 5, 10, 15, 20, 30.">
<line class="grid" x1="64" y1="250.0" x2="544" y2="250.0"/>
<text class="sm" x="56" y="254.0" text-anchor="end">0.0</text>
<line class="grid" x1="64" y1="213.3" x2="544" y2="213.3"/>
<text class="sm" x="56" y="217.3" text-anchor="end">0.1</text>
<line class="grid" x1="64" y1="176.7" x2="544" y2="176.7"/>
<text class="sm" x="56" y="180.7" text-anchor="end">0.2</text>
<line class="grid" x1="64" y1="140.0" x2="544" y2="140.0"/>
<text class="sm" x="56" y="144.0" text-anchor="end">0.3</text>
<line class="grid" x1="64" y1="103.3" x2="544" y2="103.3"/>
<text class="sm" x="56" y="107.3" text-anchor="end">0.4</text>
<line class="grid" x1="64" y1="66.7" x2="544" y2="66.7"/>
<text class="sm" x="56" y="70.7" text-anchor="end">0.5</text>
<line class="grid" x1="64" y1="30.0" x2="544" y2="30.0"/>
<text class="sm" x="56" y="34.0" text-anchor="end">0.6</text>
<line class="axis" x1="64" y1="250.5" x2="544" y2="250.5"/>
<line class="axis" x1="80" y1="250" x2="80" y2="255"/>
<text class="sm" x="80" y="270" text-anchor="middle">1</text>
<line class="axis" x1="144" y1="250" x2="144" y2="255"/>
<text class="sm" x="144" y="270" text-anchor="middle">5</text>
<line class="axis" x1="224" y1="250" x2="224" y2="255"/>
<text class="sm" x="224" y="270" text-anchor="middle">10</text>
<line class="axis" x1="304" y1="250" x2="304" y2="255"/>
<text class="sm" x="304" y="270" text-anchor="middle">15</text>
<line class="axis" x1="384" y1="250" x2="384" y2="255"/>
<text class="sm" x="384" y="270" text-anchor="middle">20</text>
<line class="axis" x1="544" y1="250" x2="544" y2="255"/>
<text class="sm" x="544" y="270" text-anchor="middle">30</text>
<text class="sm" x="304" y="290" text-anchor="middle">window length L (payments)</text>
<text class="sm" x="64" y="16">customer AP</text>
<polygon class="rf band" points="80,196.8 112,181.7 144,156.4 224,115.0 304,112.3 384,110.2 544,107.6 544,135.4 384,134.4 304,130.9 224,125.0 144,158.5 112,182.9 80,196.9"/>
<polygon class="qf band" points="80,196.6 112,182.9 144,159.1 224,118.6 304,88.9 384,64.8 544,39.2 544,66.4 384,82.6 304,96.3 224,124.0 144,163.7 112,186.2 80,197.8"/>
<polyline class="ref" points="80,192.1 112,186.0 144,166.5 224,128.5 304,101.2 384,79.3 544,45.3"/>
<polyline class="ln r" points="80,196.9 112,182.3 144,157.4 224,120.0 304,121.6 384,122.3 544,121.5"/>
<circle class="rf ring" cx="80" cy="196.9" r="4"><title>random circuit, L = 1: 0.14 ± 0.00</title></circle>
<circle class="rf ring" cx="112" cy="182.3" r="4"><title>random circuit, L = 3: 0.18 ± 0.00</title></circle>
<circle class="rf ring" cx="144" cy="157.4" r="4"><title>random circuit, L = 5: 0.25 ± 0.00</title></circle>
<circle class="rf ring" cx="224" cy="120.0" r="4"><title>random circuit, L = 10: 0.35 ± 0.01</title></circle>
<circle class="rf ring" cx="304" cy="121.6" r="4"><title>random circuit, L = 15: 0.35 ± 0.03</title></circle>
<circle class="rf ring" cx="384" cy="122.3" r="4"><title>random circuit, L = 20: 0.35 ± 0.03</title></circle>
<circle class="rf ring" cx="544" cy="121.5" r="4"><title>random circuit, L = 30: 0.35 ± 0.04</title></circle>
<polyline class="ln q" points="80,197.2 112,184.6 144,161.4 224,121.3 304,92.6 384,73.7 544,52.8"/>
<circle class="qf ring" cx="80" cy="197.2" r="4"><title>TFIM, L = 1: 0.14 ± 0.00</title></circle>
<circle class="qf ring" cx="112" cy="184.6" r="4"><title>TFIM, L = 3: 0.18 ± 0.00</title></circle>
<circle class="qf ring" cx="144" cy="161.4" r="4"><title>TFIM, L = 5: 0.24 ± 0.01</title></circle>
<circle class="qf ring" cx="224" cy="121.3" r="4"><title>TFIM, L = 10: 0.35 ± 0.01</title></circle>
<circle class="qf ring" cx="304" cy="92.6" r="4"><title>TFIM, L = 15: 0.43 ± 0.01</title></circle>
<circle class="qf ring" cx="384" cy="73.7" r="4"><title>TFIM, L = 20: 0.48 ± 0.02</title></circle>
<circle class="qf ring" cx="544" cy="52.8" r="4"><title>TFIM, L = 30: 0.54 ± 0.04</title></circle>
<text class="dk" x="556" y="43.3">logistic regression 0.56</text>
<text class="dk" x="556" y="64.8"><tspan class="b">untuned TFIM</tspan> 0.54</text>
<text class="dk" x="556" y="126.0"><tspan class="b">random circuit</tspan> 0.35</text>
</svg>
<figcaption class="caption">Untuned reservoirs, TFIM and random circuit. Dashed: logistic regression on the raw window. Shaded bands: ±1 standard deviation over the 10 reservoir seeds.</figcaption>
</figure>

In our protocol, the input reset is what makes this memory fade. Without it, the evolution is unitary: old inputs are never forgotten, only scrambled across the register, and performance collapses beyond L = 5. At L = 30, the reservoir even loses the current transaction: amount fraud, which depends on it alone, drops from 0.99 to 0.22 AP (not shown). Note, though, that on hardware the reset is a mid-circuit operation, which costs time and fidelity (see discussion below).

<figure class="reset-fig">
<style>
.reset-fig svg { width: 100%; max-width: 720px; height: auto; display: block; margin: 0 auto; }
.reset-fig .axis { stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1; }
.reset-fig .grid { stroke: var(--edge-color, #e4e4e7); stroke-width: 1; }
.reset-fig .ref { stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1.5; stroke-dasharray: 5 4; fill: none; }
.reset-fig .q { stroke: #2563eb; stroke-width: 2; fill: none; }
.reset-fig .qb { fill: #2563eb; opacity: 0.14; }
.reset-fig .qf { fill: #2563eb; stroke: var(--global-bg-color, #ffffff); stroke-width: 1.5; }
.reset-fig .qo { fill: var(--global-bg-color, #ffffff); stroke: #2563eb; stroke-width: 2; }
.reset-fig .off { stroke-dasharray: 2 3; }
html[data-theme="dark"] .reset-fig .q, html[data-theme="dark"] .reset-fig .qo { stroke: #60a5fa; }
html[data-theme="dark"] .reset-fig .qf, html[data-theme="dark"] .reset-fig .qb { fill: #60a5fa; }
.reset-fig text { font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif; font-size: 13px; fill: var(--global-text-color-light, #71717a); }
.reset-fig text.sm { font-size: 12px; }
.reset-fig text.dk { fill: var(--global-text-color, #09090b); }
.reset-fig text.b { font-weight: 600; }
</style>
<svg viewBox="0 0 720 300" role="img" aria-label="Untuned TFIM reservoir, customer-fraud average precision against window length L = 1, 3, 5, 10, 15, 20, 30. With input reset: 0.14, 0.18, 0.24, 0.35, 0.43, 0.48, 0.54. Without: 0.14, 0.18, 0.23, 0.17, 0.09, 0.07, 0.05.">
<line class="grid" x1="64" y1="250.0" x2="544" y2="250.0"/>
<text class="sm" x="56" y="254.0" text-anchor="end">0.0</text>
<line class="grid" x1="64" y1="213.3" x2="544" y2="213.3"/>
<text class="sm" x="56" y="217.3" text-anchor="end">0.1</text>
<line class="grid" x1="64" y1="176.7" x2="544" y2="176.7"/>
<text class="sm" x="56" y="180.7" text-anchor="end">0.2</text>
<line class="grid" x1="64" y1="140.0" x2="544" y2="140.0"/>
<text class="sm" x="56" y="144.0" text-anchor="end">0.3</text>
<line class="grid" x1="64" y1="103.3" x2="544" y2="103.3"/>
<text class="sm" x="56" y="107.3" text-anchor="end">0.4</text>
<line class="grid" x1="64" y1="66.7" x2="544" y2="66.7"/>
<text class="sm" x="56" y="70.7" text-anchor="end">0.5</text>
<line class="grid" x1="64" y1="30.0" x2="544" y2="30.0"/>
<text class="sm" x="56" y="34.0" text-anchor="end">0.6</text>
<line class="axis" x1="64" y1="250.5" x2="544" y2="250.5"/>
<line class="axis" x1="80" y1="250" x2="80" y2="255"/><text class="sm" x="80" y="270" text-anchor="middle">1</text>
<line class="axis" x1="144" y1="250" x2="144" y2="255"/><text class="sm" x="144" y="270" text-anchor="middle">5</text>
<line class="axis" x1="224" y1="250" x2="224" y2="255"/><text class="sm" x="224" y="270" text-anchor="middle">10</text>
<line class="axis" x1="304" y1="250" x2="304" y2="255"/><text class="sm" x="304" y="270" text-anchor="middle">15</text>
<line class="axis" x1="384" y1="250" x2="384" y2="255"/><text class="sm" x="384" y="270" text-anchor="middle">20</text>
<line class="axis" x1="544" y1="250" x2="544" y2="255"/><text class="sm" x="544" y="270" text-anchor="middle">30</text>
<text class="sm" x="304" y="290" text-anchor="middle">window length L (payments)</text>
<text class="sm" x="64" y="16">customer AP, untuned TFIM reservoir</text>
<polygon class="qb" points="80,196.6 112,182.9 144,159.1 224,118.6 304,88.9 384,64.8 544,39.2 544,66.4 384,82.6 304,96.3 224,124.0 144,163.7 112,186.2 80,197.8"/>
<polygon class="qb" points="80,196.5 112,182.5 144,163.0 224,180.4 304,206.5 384,220.2 544,230.0 544,232.6 384,226.8 304,224.4 224,197.8 144,167.3 112,184.2 80,197.7"/>
<polyline class="q off" points="80,197.1 112,183.4 144,165.2 224,189.1 304,215.5 384,223.5 544,231.3"/>
<polyline class="q" points="80,197.2 112,184.6 144,161.4 224,121.3 304,92.6 384,73.7 544,52.8"/>
<circle class="qo" cx="80" cy="197.1" r="4"><title>Without reset, L = 1: 0.14 ± 0.00</title></circle>
<circle class="qo" cx="112" cy="183.4" r="4"><title>Without reset, L = 3: 0.18 ± 0.00</title></circle>
<circle class="qo" cx="144" cy="165.2" r="4"><title>Without reset, L = 5: 0.23 ± 0.01</title></circle>
<circle class="qo" cx="224" cy="189.1" r="4"><title>Without reset, L = 10: 0.17 ± 0.02</title></circle>
<circle class="qo" cx="304" cy="215.5" r="4"><title>Without reset, L = 15: 0.09 ± 0.02</title></circle>
<circle class="qo" cx="384" cy="223.5" r="4"><title>Without reset, L = 20: 0.07 ± 0.01</title></circle>
<circle class="qo" cx="544" cy="231.3" r="4"><title>Without reset, L = 30: 0.05 ± 0.00</title></circle>
<circle class="qf" cx="80" cy="197.2" r="4.5"><title>With reset, L = 1: 0.14 ± 0.00</title></circle>
<circle class="qf" cx="112" cy="184.6" r="4.5"><title>With reset, L = 3: 0.18 ± 0.00</title></circle>
<circle class="qf" cx="144" cy="161.4" r="4.5"><title>With reset, L = 5: 0.24 ± 0.01</title></circle>
<circle class="qf" cx="224" cy="121.3" r="4.5"><title>With reset, L = 10: 0.35 ± 0.01</title></circle>
<circle class="qf" cx="304" cy="92.6" r="4.5"><title>With reset, L = 15: 0.43 ± 0.01</title></circle>
<circle class="qf" cx="384" cy="73.7" r="4.5"><title>With reset, L = 20: 0.48 ± 0.02</title></circle>
<circle class="qf" cx="544" cy="52.8" r="4.5"><title>With reset, L = 30: 0.54 ± 0.04</title></circle>
<text class="dk" x="556" y="57.3"><tspan class="b">with reset</tspan> 0.54</text>
<text class="dk" x="556" y="235.8"><tspan class="b">without reset</tspan> 0.05</text>
</svg>
<figcaption class="caption">The untuned TFIM reservoir with and without the input reset. Shaded bands: ±1 standard deviation over the 10 reservoir seeds.</figcaption>
</figure>

Also, what the readout measures matters as much as the reservoir. With the cheapest readout (Z and nearest-neighbour ZZ, 7 observables), the same untuned TFIM reservoir reaches only 0.19 customer AP at L = 15, far below logistic regression (0.41). With the XYZ-string readout (45 observables) instead, the very same reservoir reaches 0.43. The information is in the quantum state, but Z-type measurements don't expose it to a linear readout. Exposing it, however, costs more measurement settings, which creates an interesting tension when implementing on hardware.

<figure class="memO-fig">
<style>
.memO-fig svg { width: 100%; max-width: 720px; height: auto; display: block; margin: 0 auto; }
.memO-fig .axis { stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1; }
.memO-fig .grid { stroke: var(--edge-color, #e4e4e7); stroke-width: 1; }
.memO-fig .ref { stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1.5; stroke-dasharray: 5 4; fill: none; }
.memO-fig .q { stroke: #2563eb; } .memO-fig .qf { fill: #2563eb; }
.memO-fig .r { stroke: #0d9488; } .memO-fig .rf { fill: #0d9488; }
html[data-theme="dark"] .memO-fig .q { stroke: #60a5fa; } html[data-theme="dark"] .memO-fig .qf { fill: #60a5fa; }
.memO-fig .ln { stroke-width: 2; fill: none; }
.memO-fig .band { opacity: 0.14; }
.memO-fig .ring { stroke: var(--global-bg-color, #ffffff); stroke-width: 1.5; }
.memO-fig text { font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif; font-size: 13px; fill: var(--global-text-color-light, #71717a); }
.memO-fig text.sm { font-size: 12px; }
.memO-fig text.dk { fill: var(--global-text-color, #09090b); }
.memO-fig text.b { font-weight: 600; }
</style>
<svg viewBox="0 0 720 168" role="img" aria-label="Customer AP at L = 15 for the same untuned TFIM reservoir: 0.19 with Z and ZZ observables, 0.43 with the 45 XYZ strings; logistic regression 0.41.">
<line class="grid" x1="340.0" y1="30" x2="340.0" y2="140"/>
<text class="sm" x="340.0" y="158" text-anchor="middle">0.1</text>
<line class="grid" x1="410.0" y1="30" x2="410.0" y2="140"/>
<text class="sm" x="410.0" y="158" text-anchor="middle">0.2</text>
<line class="grid" x1="480.0" y1="30" x2="480.0" y2="140"/>
<text class="sm" x="480.0" y="158" text-anchor="middle">0.3</text>
<line class="grid" x1="550.0" y1="30" x2="550.0" y2="140"/>
<text class="sm" x="550.0" y="158" text-anchor="middle">0.4</text>
<line class="grid" x1="620.0" y1="30" x2="620.0" y2="140"/>
<text class="sm" x="620.0" y="158" text-anchor="middle">0.5</text>
<line class="axis" x1="270" y1="30" x2="270" y2="140"/>
<text class="dk b" x="258" y="51" text-anchor="end">Z and nearest-neighbour ZZ</text>
<text class="sm" x="258" y="67" text-anchor="end">7 observables · 1 measurement setting</text>
<g><title>Z and nearest-neighbour ZZ: 0.19</title><path class="qf" d="M270,40 H395.7 Q399.7,40 399.7,44 V64 Q399.7,68 395.7,68 H270 Z"/></g>
<text class="dk b" x="407.7" y="59">0.19</text>
<text class="dk b" x="258" y="107" text-anchor="end">XYZ strings</text>
<text class="sm" x="258" y="123" text-anchor="end">45 observables · 3 measurement settings</text>
<g><title>XYZ strings: 0.43</title><path class="qf" d="M270,96 H566.6 Q570.6,96 570.6,100 V120 Q570.6,124 566.6,124 H270 Z"/></g>
<text class="dk b" x="578.6" y="115">0.43</text>
<line class="ref" x1="554.0" y1="26" x2="554.0" y2="140"/>
<text class="sm" x="554.0" y="18" text-anchor="middle">logistic regression 0.41</text>
</svg>
<figcaption class="caption">The untuned TFIM reservoir at L = 15, with only the measured observables changed. Mean over 10 reservoir seeds.</figcaption>
</figure>

Beyond fraud scores, we also characterised our reservoirs with the information processing capacity (IPC),[^ipc] which measures how well a linear readout can reconstruct past inputs and nonlinear functions of them: the fading memory and nonlinear mixing introduced earlier. This led to some interesting analyses, which can be found in the final report.

### On hardware: shots are the bottleneck

We then simulated the TFIM reservoir at pulse level on a realistic model of a silicon spin-qubit chip with SpinPulse, including pink (1/f) noise on the qubit frequencies (T₂\* = 10 µs) and on the exchange couplings (T<sub>J</sub>\* = 5 µs). Pulse-level simulation is much slower than our exact simulator, so this experiment is smaller than the previous ones: an untuned reservoir, one seed, a subsample of the data and a different readout, with 39 observables (X, Y, Z and two-body terms). Its scores are therefore lower than in the main results, and only the comparisons within it matter.

With exact expectation values, the chip's noise costs very little: 0.31 customer AP, against 0.33 for the ideal, noiseless circuit. Indeed, the noise doesn't erase the information. It shrinks the features towards zero, and a linear readout simply rescales them.

Real hardware, however, does not give exact values: it gives shots. Each expectation value then carries an error that only shrinks as 1/√shots, and unlike the chip's noise, this error does not shrink with the features. On the chip, where the features are already shrunk, shot noise therefore weighs even more:

<figure class="shots-fig">
<style>
.shots-fig svg { width: 100%; max-width: 720px; height: auto; display: block; margin: 0 auto; }
.shots-fig .axis { stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1; fill: none; }
.shots-fig .grid { stroke: var(--edge-color, #e4e4e7); stroke-width: 1; }
.shots-fig .ref { stroke: var(--edge-strong-color, #a1a1aa); stroke-width: 1.5; stroke-dasharray: 5 4; }
.shots-fig .q { stroke: #2563eb; stroke-width: 2; fill: none; }
.shots-fig .qf { fill: #2563eb; stroke: var(--global-bg-color, #ffffff); stroke-width: 1.5; }
.shots-fig .qo { fill: var(--global-bg-color, #ffffff); stroke: #2563eb; stroke-width: 2; }
.shots-fig .chip { stroke-dasharray: 2 3; }
html[data-theme="dark"] .shots-fig .q, html[data-theme="dark"] .shots-fig .qo { stroke: #60a5fa; }
html[data-theme="dark"] .shots-fig .qf { fill: #60a5fa; }
.shots-fig text { font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif; font-size: 13px; fill: var(--global-text-color-light, #71717a); }
.shots-fig text.sm { font-size: 12px; }
.shots-fig text.dk { fill: var(--global-text-color, #09090b); }
.shots-fig text.b { font-weight: 600; }
</style>
<svg viewBox="0 0 720 270" role="img" aria-label="Untuned TFIM reservoir: customer AP at L = 15 against shots per transaction (1,000; 10,000; 100,000; exact). Ideal circuit: 0.09, 0.21, 0.33, 0.33. Today's chip: 0.08, 0.17, 0.27, 0.31. Logistic regression: 0.36.">
<line class="grid" x1="70" y1="220.0" x2="600" y2="220.0"/>
<text class="sm" x="62" y="224.0" text-anchor="end">0.0</text>
<line class="grid" x1="70" y1="172.5" x2="600" y2="172.5"/>
<text class="sm" x="62" y="176.5" text-anchor="end">0.1</text>
<line class="grid" x1="70" y1="125.0" x2="600" y2="125.0"/>
<text class="sm" x="62" y="129.0" text-anchor="end">0.2</text>
<line class="grid" x1="70" y1="77.5" x2="600" y2="77.5"/>
<text class="sm" x="62" y="81.5" text-anchor="end">0.3</text>
<line class="grid" x1="70" y1="30.0" x2="600" y2="30.0"/>
<text class="sm" x="62" y="34.0" text-anchor="end">0.4</text>
<line class="axis" x1="70" y1="220.5" x2="466" y2="220.5"/><line class="axis" x1="482" y1="220.5" x2="600" y2="220.5"/>
<path class="axis" d="M462,226 L470,215 M478,226 L486,215"/>
<line class="axis" x1="110" y1="220" x2="110" y2="225"/><text class="sm" x="110" y="241" text-anchor="middle">1,000</text>
<line class="axis" x1="250" y1="220" x2="250" y2="225"/><text class="sm" x="250" y="241" text-anchor="middle">10,000</text>
<line class="axis" x1="390" y1="220" x2="390" y2="225"/><text class="sm" x="390" y="241" text-anchor="middle">100,000</text>
<line class="axis" x1="560" y1="220" x2="560" y2="225"/><text class="sm" x="560" y="241" text-anchor="middle">exact</text>
<text class="sm" x="335" y="262" text-anchor="middle">shots per transaction</text>
<text class="sm" x="70" y="16">customer AP, L = 15</text>
<line class="ref" x1="70" y1="49.0" x2="600" y2="49.0"/>
<text class="sm" x="78" y="64.0">logistic regression 0.36</text>
<polyline class="q chip" points="110,182.0 250,139.2 390,91.8 560,72.8"/>
<polyline class="q" points="110,177.2 250,120.3 390,63.2 560,63.2"/>
<circle class="qo" cx="110" cy="182.0" r="4.5"><title>Today's chip, 1,000 shots: 0.08</title></circle>
<circle class="qo" cx="250" cy="139.2" r="4.5"><title>Today's chip, 10,000 shots: 0.17</title></circle>
<circle class="qo" cx="390" cy="91.8" r="4.5"><title>Today's chip, 100,000 shots: 0.27</title></circle>
<circle class="qo" cx="560" cy="72.8" r="4.5"><title>Today's chip, exact shots: 0.31</title></circle>
<circle class="qf" cx="110" cy="177.2" r="5"><title>Ideal circuit, 1,000 shots: 0.09</title></circle>
<circle class="qf" cx="250" cy="120.3" r="5"><title>Ideal circuit, 10,000 shots: 0.21</title></circle>
<circle class="qf" cx="390" cy="63.2" r="5"><title>Ideal circuit, 100,000 shots: 0.33</title></circle>
<circle class="qf" cx="560" cy="63.2" r="5"><title>Ideal circuit, exact shots: 0.33</title></circle>
<text class="dk b" x="572" y="59.2">ideal circuit</text>
<text class="dk b" x="572" y="84.8">today’s chip</text>
</svg>
<figcaption class="caption">Subsample of 10,000 windows per split, one reservoir seed. The chip results average 20 noise realisations per window.</figcaption>
</figure>

In this reduced experiment, even the ideal circuit falls short of logistic regression on the same windows (0.33 vs 0.36), and finite shots widen the gap: the chip already degrades at 10⁵ shots per transaction, the ideal circuit only below.

The shot budget also changes which observables are worth measuring. And observables that are diagonal in the same basis can be estimated from the same shots, so the cost grows with the number of measurement settings rather than of observables. On a separate memory benchmark (not shown), the extra X and Y settings only paid off from about 10⁴ shots.

### Resource estimation

Finally, we estimated what a single fraud decision would cost in time and energy, the two constraints from our use-case framing. On a quantum chip, every shot reruns the whole window of 15 transactions, so both grow linearly with the number of shots.

<figure class="table-fig">
<table class="data-table">
<thead><tr><th>Implementation</th><th class="num">Time per decision</th><th class="num">Energy per decision</th></tr></thead>
<tbody><tr class="group"><th colspan="3">On a CPU</th></tr>
<tr><td>Logistic regression</td><td class="num">~1 µs</td><td class="num">~0.03 mJ</td></tr>
<tr><td>ESN, 45 units</td><td class="num">15 µs</td><td class="num">0.4 mJ</td></tr>
<tr><td>QRC, exact simulation</td><td class="num">0.25 ms</td><td class="num">7.6 mJ</td></tr>
</tbody>
<tbody><tr class="group"><th colspan="3">On a quantum chip</th></tr>
<tr><td>QRC, 1,000 shots</td><td class="num">0.37 s</td><td class="num">7.5 kJ</td></tr>
<tr><td>QRC, 10,000 shots</td><td class="num">3.7 s</td><td class="num">75 kJ</td></tr>
</tbody>
</table>
<figcaption class="caption">Estimated cost of one fraud decision at L = 15. The CPU is assumed to draw 30 W. For the chip, we assume 10 µs per reset and per readout, and the 20.5 kW of a Quobly Alloy Pioneer system (figure provided by Quobly), most of it for cryogenic cooling.</figcaption>
</figure>

Even at 1,000 shots, a decision takes 0.37 s, well beyond what real-time authorisation allows, so our system could only be used after authorisation. There, an issuer processing a million transactions a day at 10,000 shots would need about 40 such systems running in parallel. And the energy bill alone would nearly erase the benefit: at an electricity price of about €0.20 per kWh, the 75 kJ of a 10,000-shot decision cost about €0.004, close to our estimate of what fraud costs per payment checked, before even counting the hardware itself.

For our four-qubit reservoir, the comparison with simulation is stark: simulating it exactly on a CPU is three to four orders of magnitude faster and six to seven orders of magnitude cheaper in energy than running it on a quantum chip.

## Limitations

We highlight that our conclusions hold for a deliberately simple setting, and most of their limits follow from that simplicity.

**Our use case is a toy version of the real problem.** Without access to real transaction data, our modelling of the problem was very limited. The simulator's fraud scenarios are plausible in spirit, but each one is a single, highly simplified pattern, and they shaped the rest of our design. For reasons detailed above, we chose to feed the model windows with the card's history, each transaction being described by a single raw feature: this design is probably not the best, and it restricted our study to customer fraud. And as such fraud shows up within a card's last few payments, the task may simply not need to look far into the past, which is where a reservoir's memory would matter.

**The classical bar could be higher, and the statistics are thin.** Our classical baselines were simple ones: logistic regression, an ESN and an LSTM, all on the same raw window. We did not try gradient-boosted trees on engineered features, the industry standard. Moreover, our statistics are limited: the results come from one dataset and one chronological split, most of them with 10 reservoir seeds. As the window-length figure shows, at long windows (L ≥ 20) the spread between seeds is larger than the gap between the TFIM reservoir and logistic regression, so differences there are not conclusive. Finally, the main comparison was run at L = 15 because it was the window length most favourable to the untuned quantum reservoir, but other values could have led to different conclusions.

**Our hardware model is simplified.** Our SpinPulse simulations capture the chip's main dephasing noise, but not everything a real run would face. SpinPulse cannot compile a mid-circuit reset into pulses, so the input reset was applied ideally, although it occurs at every step of every shot. Measurements in the X and Y bases were also idealised, as a perfect rotation followed by a Z measurement. Neither T₁ energy relaxation nor the drift of real spin-qubit noise over time could be modelled.

Most of these caveats make our negative result conservative rather than misleading: a stronger classical baseline, a less favourable window length or a more realistic hardware model would all widen the gap. The real open question is the use case itself, and whether a richer one would give a quantum reservoir more to work with.

## Outlook

Our negative result leaves several directions open, from the use case down to the hardware.

- **Better use cases.** Define the fraud use case more carefully and work with more realistic data, but also look beyond fraud, for time series where the signal genuinely depends on a longer history, such as meteorological data.
- **QRC alongside classical models.** Rather than competing with a GBDT, the quantum reservoir could feed it extra features next to engineered ones. This is how a payment company would most likely use it, and it would show whether the reservoir adds anything to the industry standard.
- **Larger registers and more features.** Once a suitable use case is found, the next step would be to scale up. Only then could the real promise of QRC, encoding many features in a large Hilbert space with few resources, actually be tested beyond the reach of exact simulation.
- **Other Hamiltonians.** Our implementation is modular and already supports other reservoir Hamiltonians, such as the chip's native exchange interaction. Their symmetries and physical parameters, and how these affect performance and cost, would deserve a closer study.
- **Dissipation.** The input reset gives our reservoir its fading memory, but it most likely has a real overhead on hardware, and implementing it on Quobly's chips remains open.[^reset] Maybe the chip's own noise could replace it, at least in part. This is an appealing idea, but its effect is hard to predict theoretically.
- **Smarter readouts.** Map the shot threshold above which measuring more observables brings more information, which presumably rises with gate noise, and choose observables that extract more information per measurement.
- **Hardware.** Share the cryostat's energy cost by running several small reservoirs on one chip, model native measurements in bases other than Z, active reset and noise drift in SpinPulse, and, overall, push for higher shot rates and fidelities.

## Conclusion

So, is credit-card fraud detection a viable NISQ use case for quantum reservoir computing? On our simulated data, not yet. The quantum reservoir does build a useful memory of the card's history, but an equally tuned classical reservoir detects more fraud, at a tiny fraction of the cost.

Beyond fraud, we learned two lessons. First, an apparent quantum edge only counts once the classical baselines have been tuned with the same care. Second, small quantum reservoirs are far cheaper to simulate than to run: hardware only becomes worth considering for registers too large to simulate, i.e. with tens of qubits. And there, our results suggest that the shot budget, not the register size, would be the limit.

Finally, I would like to warmly thank our company coaches at Quobly, Alain Champenois and Karla Baumann, for their guidance, availability and the discussions that shaped this project; the JIP team at TU Delft, for making this kind of experience possible; and my teammates, for ten weeks of hard work and great company.

[^jip]: MSc course in which interdisciplinary student teams spend ten weeks working full time on a challenge set by an industry partner. See [Joint Interdisciplinary Project](https://www.jointinterdisciplinaryproject.nl).
[^team]: Linh Dang, Prisha Meswani, Julian Ruiz Avella, Radu Cosmin Dumitru, Lola Serrano Carrasco and Ioanna Giannakopoulou.
[^dnb]: De Nederlandsche Bank (2026), [_More fraud in payments in 2025_](https://www.dnb.nl/en/general-news/statistical-news/2026/more-fraud-in-payments-in-2025/). The rate of 7 in 100,000 covers all payment types. The data cover about two-thirds of the Dutch market.
[^avg]: Our calculation from the De Nederlandsche Bank figures (2026): €41 million / 514,000 fraudulent card payments ≈ €80, and €80 × 7 / 100,000 ≈ €0.006. This mixes an average for card payments with a fraud rate for all payment types, so it is only an order of magnitude.
[^declines]: Checkout.com with Oxford Economics (2023), [survey of 1,500 enterprise businesses and over 8,000 consumers](https://www.checkout.com/newsroom/checkout-com-research-finds-us-businesses-lag-behind-in-payment-performance-losing-2-1-of-global-revenues-annually). Vendor-run research.
[^latency]: Branco et al. (2020), [_Interleaved Sequence RNNs for Fraud Detection_](https://doi.org/10.1145/3394486.3403361), KDD '20, pp. 3101–3109. In the production system of Feedzai, a fraud-prevention vendor, a transaction may take at most 200 ms to be fully processed, even at the 99.999th percentile; a typical setup takes 2–3 ms on average.
[^fds]: Le Borgne et al. (2022), [_Credit card fraud detection system_](https://fraud-detection-handbook.github.io/fraud-detection-handbook/Chapter_2_Background/FDS.html), Section 2.3 of the _Fraud Detection Handbook_. Terminal checks and blocking rules run in real time, before authorisation; scoring rules and data-driven models in near real time; human investigators offline.
[^gbdt]: Chen & Guestrin (2016), [_XGBoost: A Scalable Tree Boosting System_](https://doi.org/10.1145/2939672.2939785), KDD '16, pp. 785–794. Branco et al. (2020) describe tree-based models on engineered card profiles as the usual choice in production fraud detection.
[^shap]: Lundberg & Lee (2017), [_A Unified Approach to Interpreting Model Predictions_](https://papers.nips.cc/paper_files/paper/2017/hash/8a20a8621978632d76c43dfd28b67767-Abstract.html), NeurIPS 30.
[^rnn]: For example the GRU-based models of Branco et al. (2020), deployed in Feedzai's production system.
[^gnn]: For example Van Belle et al. (2022), [_Inductive Graph Representation Learning for fraud detection_](https://doi.org/10.1016/j.eswa.2021.116463), Expert Systems with Applications 193, 116463; and Xiang et al. (2023), [_Semi-supervised Credit Card Fraud Detection via Attribute-Driven Graph Representation_](https://doi.org/10.1609/aaai.v37i12.26702), AAAI '23, pp. 14557–14565.
[^kaggle]: [_Credit Card Fraud Detection_](https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud), Machine Learning Group, Université Libre de Bruxelles, introduced in Dal Pozzolo et al. (2015), [_Calibrating Probability with Undersampling for Unbalanced Classification_](https://doi.org/10.1109/SSCI.2015.33), IEEE SSCI 2015, pp. 159–166.
[^handbook]: Le Borgne et al. (2022), [_Reproducible Machine Learning for Credit Card Fraud Detection: Practical Handbook_](https://fraud-detection-handbook.github.io/fraud-detection-handbook/), Université Libre de Bruxelles.
[^esn]: Jaeger (2001), _The "echo state" approach to analysing and training recurrent neural networks_, GMD Report 148, German National Research Center for Information Technology.
[^fujii]: Fujii & Nakajima (2017), [_Harnessing Disordered-Ensemble Quantum Dynamics for Machine Learning_](https://doi.org/10.1103/PhysRevApplied.8.024030), Physical Review Applied 8, 024030.
[^mujal21]: Mujal et al. (2021), [_Opportunities in Quantum Reservoir Computing and Extreme Learning Machines_](https://doi.org/10.1002/qute.202100027), Advanced Quantum Technologies 4, 2100027.
[^mujal23]: Mujal et al. (2023), [_Time-series quantum reservoir computing with weak and projective measurements_](https://doi.org/10.1038/s41534-023-00682-z), npj Quantum Information 9, 16.
[^qelm]: See Innocenti et al. (2023), [_Potential and limitations of quantum extreme learning machines_](https://doi.org/10.1038/s42005-023-01233-w), Communications Physics 6, 118, and the review by Mujal et al. (2021).
[^spinpulse]: Vermersch et al. (2026), [_The SpinPulse library for transpilation and noise-accurate simulation of spin qubit quantum computers_](https://arxiv.org/abs/2601.10435), arXiv:2601.10435.
[^lstm]: Hochreiter & Schmidhuber (1997), [_Long Short-Term Memory_](https://doi.org/10.1162/neco.1997.9.8.1735), Neural Computation 9(8), 1735–1780.
[^optuna]: Akiba et al. (2019), [_Optuna: A Next-generation Hyperparameter Optimization Framework_](https://doi.org/10.1145/3292500.3330701), KDD '19, pp. 2623–2631.
[^ipc]: Dambre et al. (2012), [_Information Processing Capacity of Dynamical Systems_](https://doi.org/10.1038/srep00514), Scientific Reports 2, 514.
[^reset]: One idea would be to swap the used input qubits for fresh ancillae, either shuttled from a factory or reset in a pool. Another would be to skip the classical feedback of the active reset and keep only the projective measurement. This would not be a true reset, but it might still provide enough dissipation for fading memory.
