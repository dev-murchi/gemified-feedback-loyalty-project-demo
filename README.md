<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Demo

There is no mobile app yet, so a small simulator (`scripts/demo-sim`, port 3001) hands out what a phone produces by itself: the QR content, the device key id, the attestation, the signatures and `X-Platform-Proof`. It never calls the backend; you send the requests yourself (Postman or curl).

```bash
# terminal 1: the API on 3000 with the demo catalog (2 brands, 10 branches), in-memory stores,
# the worker inside the API process and the fake LLM
npm run start:demo

# terminal 2: the simulator on 3001
npm run demo-sim
```

`start:demo` reads `scripts/demo-sim/demo.env`; a variable already set in the shell wins over it.

### Before `start:demo` (optional)

B2B clients need a secret, so they are not in `demo.env`. Set `B2B_DEMO_CLIENTS` in the shell (one client per brand, secrets of at least 32 characters, e.g. from `openssl rand -hex 32`, which has no `+`, `/` or `=`):

```bash
export B2B_DEMO_CLIENTS='[
  {"clientId":"fuel-panel","brand":"fuel","secret":"<secret 1>","scope":"b2b.feedback.read b2b.summary.read"},
  {"clientId":"coffee-panel","brand":"coffee","secret":"<secret 2>","scope":"b2b.feedback.read b2b.summary.read"}
]'
```

The default `LLM_DRIVER=fake` labels every comment valid / neutral / topic `other`. For a real analysis set `LLM_DRIVER=openai`, `OPENAI_API_KEY` and `OPENAI_MODEL` in the shell.

### Simulator endpoints

| Request                                                                                       | Returns                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /qr`                                                                                     | The QR content (`qrUrl`, `qrToken`) of every branch                                                                                                                                                                                                 |
| `GET /devices?platform=ios\|android&nonce=…[&deviceId=…][&integrity=fail]`                    | A phone and its `register` and `session` bodies, signed over the nonce. Without `deviceId` a new phone is made; with `integrity=fail` its registration makes a low-trust account (no rewards). Send only one of `register` and `session` per nonce. |
| `POST /devices/{deviceId}/feedback` (body: the payload you will send to `POST /v1/feedbacks`) | `idempotencyKey` (your `Idempotency-Key` header, or a new UUID) and `xPlatformProof` for exactly that body                                                                                                                                          |

### Postman order

1. `POST :3000/v1/auth/challenge` → `nonce` (single use, 60 seconds: do the next two steps at once).
2. `GET :3001/devices?platform=ios&nonce=<nonce>` → copy `deviceId` and the `register` body.
3. `POST :3000/v1/auth/register` with the `register` body → `accessToken`. To sign in again later (the token lasts 15 minutes): a **new** challenge, `GET :3001/devices?platform=ios&deviceId=<id>&nonce=<new nonce>`, `POST :3000/v1/auth/session` with the `session` body.
4. `GET :3001/qr` → pick a `qrToken`.
5. Write the feedback body, for example `{"qrToken":"<qrToken>","text":"At least twenty characters of feedback."}`.
6. `POST :3001/devices/<deviceId>/feedback` with that exact body → `idempotencyKey` and `xPlatformProof`.
7. `POST :3000/v1/feedbacks` with **the same bytes** as the body and the headers `Authorization: Bearer <accessToken>`, `Idempotency-Key`, `X-Platform-Proof` → `202`, `rewardEligible: true`.
8. `GET :3000/v1/feedbacks/<feedbackId>` until `status` is no longer `analyzing` (about a second), then `GET :3000/v1/me/wallet`.

**The feedback body must be sent byte for byte as it was signed.** The proof covers the raw bytes and the `Idempotency-Key`: a space, a different key order or a changed character still gets a `202`, but with `rewardEligible: false` and no reward. The same branch again within 24 hours gives `422 REWARD_COOLDOWN`.

Then the brand side (needs `B2B_DEMO_CLIENTS`; in Postman use the body type `x-www-form-urlencoded`, which encodes the values; a raw `+` in a secret would reach the server as a space and give `401 invalid_client`): `POST :3000/v1/b2b/oauth/token` (`application/x-www-form-urlencoded`: `grant_type=client_credentials`, `client_id`, `client_secret`, `scope`) → `GET /v1/b2b/branches` → `GET /v1/b2b/feedbacks?branchId=…` → `GET /v1/b2b/branches/{branchId}/summary`, each with `Authorization: Bearer <access_token>`.

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observer](https://observer.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
