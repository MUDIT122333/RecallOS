# Personal Brain — Software Design Specification (SDD)

**Project:** Personal Brain  
**Role:** SDE-I Take-Home Assignment  
**Status:** Implementation Specification  
**Version:** 1.0  
**Date:** 17 August 2026

---

## 1. Purpose

Personal Brain is a conversational knowledge system that allows a user to ask natural-language questions about their personal data.

The system connects to multiple personal data sources, ingests their contents into a unified knowledge store, retrieves relevant evidence, and uses an LLM to generate a conversational response grounded in the retrieved data.

The primary goal is to demonstrate:

1. Multi-source personal data integration.
2. Persistent knowledge storage using GBrain.
3. Natural-language querying.
4. Retrieval-Augmented Generation (RAG).
5. Cross-source reasoning.
6. Grounded responses without fabricated personal facts.

---

# 2. Problem Statement

Personal information is distributed across multiple services.

For example:

- Gmail may contain a job application confirmation.
- Gmail may contain a recruiter response.
- Google Drive may contain the corresponding resume or take-home assignment.

A conventional search interface treats these sources independently.

Personal Brain provides a unified conversational interface that can retrieve information from multiple sources and combine the evidence into a single answer.

Example:

> "What jobs have I applied to, what is the status of each, and did I submit any take-home assignments?"

The system should be able to correlate relevant Gmail and Google Drive information to answer this question.

---

# 3. Goals

## 3.1 Functional Goals

The system must:

- Connect to Gmail.
- Connect to Google Drive.
- Authenticate using Google OAuth 2.0.
- Synchronize data from both sources.
- Store synchronized data in GBrain.
- Use GBrain as the knowledge/retrieval layer.
- Provide a conversational chat interface.
- Retrieve relevant evidence for user questions.
- Generate answers using an LLM.
- Support single-source queries.
- Support cross-source queries.
- Avoid fabricating information that does not exist in the connected data.

---

## 3.2 Non-Goals

The following are outside the scope of the initial prototype:

- Supporting every possible personal data provider.
- Building a custom vector database.
- Implementing a fully autonomous multi-agent system.
- Building a production-grade enterprise authentication system.
- Real-time synchronization with every connector.
- Advanced autonomous task execution.

---

# 4. Requirements

## 4.1 Connected Sources

The prototype will connect at least two personal data sources:

### Source 1 — Gmail

Used for:

- Emails
- Email subjects
- Email bodies
- Sender/recipient information
- Relevant timestamps
- Application and communication history

### Source 2 — Google Drive

Used for:

- Documents
- Files
- File metadata
- Relevant document contents
- Take-home assignments and other artifacts

---

# 5. High-Level Architecture

```text
                         USER
                           |
                           v
                  +----------------+
                  |   Next.js UI   |
                  |  Chat Window   |
                  +-------+--------+
                          |
                          v
                    /api/chat
                          |
                          v
                 +------------------+
                 | Query / Retrieval|
                 |    Pipeline      |
                 +--------+---------+
                          |
                          v
                 +------------------+
                 |      GBrain      |
                 | Knowledge Store  |
                 |     + Search     |
                 +--------+---------+
                          |
                     Evidence
                          |
                          v
                 +------------------+
                 |  Google Gemini   |
                 |  Answer Generator|
                 +--------+---------+
                          |
                          v
                   Final Response