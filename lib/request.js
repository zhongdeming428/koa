
'use strict';

/**
 * Module dependencies.
 */

const URL = require('url').URL;
const net = require('net');
// 内容协商的模块
const accepts = require('accepts');
const contentType = require('content-type');
// 将 URL 对象转化为 URL 字符串
const stringify = require('url').format;
// 将 URL 字符串转化为一个 URL 对象
const parse = require('parseurl');
const qs = require('querystring');
const typeis = require('type-is');
// 用于校验缓存有效性的模块：https://www.npmjs.com/package/fresh
const fresh = require('fresh');
const only = require('only');
const util = require('util');

const IP = Symbol('context#ip');

/**
 * Prototype.
 */

module.exports = {

  /**
   * Return request header.
   * 返回请求头信息，源于 Nodejs 原生的 Incoming Message 对象：https://nodejs.org/docs/latest-v9.x/api/http.html#http_message_headers
   * @return {Object}
   * @api public
   */

  get header() {
    return this.req.headers;
  },

  /**
   * Set request header.
   * 设置请求的 header
   * @api public
   */

  set header(val) {
    this.req.headers = val;
  },

  /**
   * Return request header, alias as request.header
   * 同 header getter 方法
   * @return {Object}
   * @api public
   */

  get headers() {
    return this.req.headers;
  },

  /**
   * Set request header, alias as request.header
   * 同 header setter 方法
   * @api public
   */

  set headers(val) {
    this.req.headers = val;
  },

  /**
   * Get request URL.
   * 返回请求对象的 URL，源于 IncomingMessage 对象，返回的是一个字符串：https://nodejs.org/docs/latest-v9.x/api/http.html#http_message_url
   * @return {String}
   * @api public
   */

  get url() {
    return this.req.url;
  },

  /**
   * Set request URL.
   * 设置请求的 URL
   * @api public
   */

  set url(val) {
    this.req.url = val;
  },

  /**
   * Get origin of URL.
   * 获取请求的源，包括请求协议和请求域
   * @return {String}
   * @api public
   */

  get origin() {
    return `${this.protocol}://${this.host}`;
  },

  /**
   * Get full request URL.
   * 获取完整的请求 URL，包括协议、域名和具体路由
   * @return {String}
   * @api public
   */

  get href() {
    // support: `GET http://example.com/foo`
    // request.originUrl 定义于 application.js 下面的 createContext 函数，用于保存最原始的请求 url
    // 如果原始的 URL 带有请求协议，那就直接返回，否则加上协议和域名后再返回
    if (/^https?:\/\//i.test(this.originalUrl)) return this.originalUrl;
    return this.origin + this.originalUrl;
  },

  /**
   * Get request method.
   * 返回请求的方法：https://nodejs.org/docs/latest-v9.x/api/http.html#http_message_method
   * @return {String}
   * @api public
   */

  get method() {
    return this.req.method;
  },

  /**
   * Set request method.
   * 改写请求的方法
   * @param {String} val
   * @api public
   */

  set method(val) {
    this.req.method = val;
  },

  /**
   * Get request pathname.
   * 获取请求的路由，比如 `/user/list`，不包含查询参数
   * @return {String}
   * @api public
   */

  get path() {
    // 通过 parseurl 模块转换 url
    return parse(this.req).pathname;
  },

  /**
   * Set pathname, retaining the query-string when present.
   * 设置请求的路由
   * @param {String} path
   * @api public
   */

  set path(path) {
    const url = parse(this.req);
    // 如果当前路由即为要设置的路由，则直接返回
    if (url.pathname === path) return;

    url.pathname = path;
    url.path = null;

    // 否则设置 url 对象的 pathname 属性之后再转换称 url 字符串，赋值给 request.url
    this.url = stringify(url);
  },

  /**
   * Get parsed query-string.
   * 获取查询对象
   * @return {Object}
   * @api public
   */

  get query() {
    // 先获取最原始的查询字符串，在 request 对象上会维护一个缓存对象，querystring 为键，具体的对象为值
    const str = this.querystring;
    const c = this._querycache = this._querycache || {};
    return c[str] || (c[str] = qs.parse(str));
  },

  /**
   * Set query-string as an object.
   * 设置 query 对象
   * @param {Object} obj
   * @api public
   */

  set query(obj) {
    // 直接设置 querystring，因为 query 对象由 querystring 转换而来
    this.querystring = qs.stringify(obj);
  },

  /**
   * Get query string.
   * 获取请求的查询字符串（不带问号），每次都从 req 对象重新获取
   * @return {String}
   * @api public
   */

  get querystring() {
    if (!this.req) return '';
    return parse(this.req).query || '';
  },

  /**
   * Set querystring.
   * 设置 querystring 查询字符串
   * @param {String} str
   * @api public
   */

  set querystring(str) {
    const url = parse(this.req);
    // 如果要设置的 querystring 和现在的相同，就直接返回
    if (url.search === `?${str}`) return;

    url.search = str;
    url.path = null;

    this.url = stringify(url);
  },

  /**
   * Get the search string. Same as the querystring
   * except it includes the leading ?.
   * 根据官方文档，search 就是 querystring 前面多了个问号
   * @return {String}
   * @api public
   */

  get search() {
    if (!this.querystring) return '';
    return `?${this.querystring}`;
  },

  /**
   * Set the search string. Same as
   * request.querystring= but included for ubiquity.
   * 设置 search 就是直接设置 querystring
   * @param {String} str
   * @api public
   */

  set search(str) {
    this.querystring = str;
  },

  /**
   * Parse the "Host" header field host
   * and support X-Forwarded-Host when a
   * proxy is enabled.
   * 根据请求头获取当前请求的 Host
   * @return {String} hostname:port
   * @api public
   */

  get host() {
    // 查看是否有代理
    const proxy = this.app.proxy;
    // 如果有代理就查询 `X-Forward-Host` 请求头
    let host = proxy && this.get('X-Forwarded-Host');
    // 如果没有结果的话就根据 HTTP 版本继续查询
    if (!host) {
      // HTTP 版本大于 2 的话，根据 `:authority` 获取
      if (this.req.httpVersionMajor >= 2) host = this.get(':authority');
      // 如果还是没结果的话就使用 `Host` 请求头
      if (!host) host = this.get('Host');
    }
    if (!host) return '';
    // 获取第一个逗号之前的部分
    return host.split(/\s*,\s*/, 1)[0];
  },

  /**
   * Parse the "Host" header field hostname
   * and support X-Forwarded-Host when a
   * proxy is enabled.
   * 获取主机名
   * @return {String} hostname
   * @api public
   */

  get hostname() {
    const host = this.host;
    if (!host) return '';
    // IPv6 的时候 URL 格式会有差异：https://www.cnblogs.com/hdtianfu/p/3159556.html
    if ('[' == host[0]) return this.URL.hostname || ''; // IPv6
    // 如果不是 IPv6 的话，获取冒号前的部分：https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/split
    return host.split(':', 1)[0];
  },

  /**
   * Get WHATWG parsed URL.
   * Lazily memoized.
   * 获取 WHATWG 标准的 URL 对象
   * @return {URL|Object}
   * @api public
   */

  get URL() {
    /* istanbul ignore else */
    if (!this.memoizedURL) {
      // 如果缓存的 URL 对象为空，那么获取新的 URL 对象之后进行缓存
      // this.originUrl 是从 this.req 获取的最原始的 url
      const originalUrl = this.originalUrl || ''; // avoid undefined in template string
      try {
        this.memoizedURL = new URL(`${this.origin}${originalUrl}`);
      } catch (err) {
        this.memoizedURL = Object.create(null);
      }
    }
    return this.memoizedURL;
  },

  /**
   * Check if the request is fresh, aka
   * Last-Modified and/or the ETag
   * still match.
   * 根据缓存协商（If-None-Match 和 If-Modified-Since）检查请求是否是最新的
   * @return {Boolean}
   * @api public
   */

  get fresh() {
    const method = this.method;
    const s = this.ctx.status;

    // GET or HEAD for weak freshness validation only
    // GET 和 HEAD 请求直接返回 false
    if ('GET' != method && 'HEAD' != method) return false;

    // 2xx or 304 as per rfc2616 14.26
    if ((s >= 200 && s < 300) || 304 == s) {
      return fresh(this.header, this.response.header);
    }

    return false;
  },

  /**
   * Check if the request is stale, aka
   * "Last-Modified" and / or the "ETag" for the
   * resource has changed.
   * 与 fresh 相反，判断缓存是否失效
   * @return {Boolean}
   * @api public
   */

  get stale() {
    return !this.fresh;
  },

  /**
   * Check if the request is idempotent.
   * 判断请求是否是幂等的
   * @return {Boolean}
   * @api public
   */

  get idempotent() {
    // 幂等的请求方法
    const methods = ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS', 'TRACE'];
    return !!~methods.indexOf(this.method);
  },

  /**
   * Return the request socket.
   * 返回请求的 socket 对象
   * @return {Connection}
   * @api public
   */

  get socket() {
    return this.req.socket;
  },

  /**
   * Get the charset when present or undefined.
   * 获取请求的 content-type 请求头
   * @return {String}
   * @api public
   */

  get charset() {
    try {
      const { parameters } = contentType.parse(this.req);
      return parameters.charset || '';
    } catch (e) {
      return '';
    }
  },

  /**
   * Return parsed Content-Length when present.
   * 返回 content-length 实体长度
   * @return {Number}
   * @api public
   */

  get length() {
    const len = this.get('Content-Length');
    if (len == '') return;
    return ~~len;
  },

  /**
   * Return the protocol string "http" or "https"
   * when requested with TLS. When the proxy setting
   * is enabled the "X-Forwarded-Proto" header
   * field will be trusted. If you're running behind
   * a reverse proxy that supplies https for you this
   * may be enabled.
   * 返回协议
   * @return {String}
   * @api public
   */

  get protocol() {
    if (this.socket.encrypted) return 'https';
    if (!this.app.proxy) return 'http';
    const proto = this.get('X-Forwarded-Proto');
    return proto ? proto.split(/\s*,\s*/, 1)[0] : 'http';
  },

  /**
   * Short-hand for:
   *
   *    this.protocol == 'https'
   * 返回当前协议是否安全
   * @return {Boolean}
   * @api public
   */

  get secure() {
    return 'https' == this.protocol;
  },

  /**
   * When `app.proxy` is `true`, parse
   * the "X-Forwarded-For" ip address list.
   *
   * For example if the value were "client, proxy1, proxy2"
   * you would receive the array `["client", "proxy1", "proxy2"]`
   * where "proxy2" is the furthest down-stream.
   * 当开启了代理的时候，返回请求所经过的所有代理服务器
   * @return {Array}
   * @api public
   */

  get ips() {
    const proxy = this.app.proxy;
    const val = this.get('X-Forwarded-For');
    return proxy && val
      ? val.split(/\s*,\s*/)
      : [];
  },

  /**
   * Return request's remote address
   * When `app.proxy` is `true`, parse
   * the "X-Forwarded-For" ip address list and return the first one
   * 返回当前请求的 IP，如果有多级代理服务器的话，返回第一个
   * @return {String}
   * @api public
   */

  get ip() {
    if (!this[IP]) {
      this[IP] = this.ips[0] || this.socket.remoteAddress || '';
    }
    return this[IP];
  },

  set ip(_ip) {
    this[IP] = _ip;
  },

  /**
   * Return subdomains as an array.
   *
   * Subdomains are the dot-separated parts of the host before the main domain
   * of the app. By default, the domain of the app is assumed to be the last two
   * parts of the host. This can be changed by setting `app.subdomainOffset`.
   *
   * For example, if the domain is "tobi.ferrets.example.com":
   * If `app.subdomainOffset` is not set, this.subdomains is
   * `["ferrets", "tobi"]`.
   * If `app.subdomainOffset` is 3, this.subdomains is `["tobi"]`.
   * 返回子域名
   * @return {Array}
   * @api public
   */

  get subdomains() {
    const offset = this.app.subdomainOffset;
    const hostname = this.hostname;
    if (net.isIP(hostname)) return [];
    return hostname
      .split('.')
      .reverse()
      .slice(offset);
  },

  /**
   * Get accept object.
   * Lazily memoized.
   * 获取当前请求匹配的 Accept 对象
   * @return {Object}
   * @api private
   */
  get accept() {
    return this._accept || (this._accept = accepts(this.req));
  },

  /**
   * Set accept object.
   *
   * @param {Object}
   * @api private
   */
  set accept(obj) {
    this._accept = obj;
  },

  /**
   * Check if the given `type(s)` is acceptable, returning
   * the best match when true, otherwise `false`, in which
   * case you should respond with 406 "Not Acceptable".
   *
   * The `type` value may be a single mime type string
   * such as "application/json", the extension name
   * such as "json" or an array `["json", "html", "text/plain"]`. When a list
   * or array is given the _best_ match, if any is returned.
   *
   * Examples:
   *
   *     // Accept: text/html
   *     this.accepts('html');
   *     // => "html"
   *
   *     // Accept: text/*, application/json
   *     this.accepts('html');
   *     // => "html"
   *     this.accepts('text/html');
   *     // => "text/html"
   *     this.accepts('json', 'text');
   *     // => "json"
   *     this.accepts('application/json');
   *     // => "application/json"
   *
   *     // Accept: text/*, application/json
   *     this.accepts('image/png');
   *     this.accepts('png');
   *     // => false
   *
   *     // Accept: text/*;q=.5, application/json
   *     this.accepts(['html', 'json']);
   *     this.accepts('html', 'json');
   *     // => "json"
   * 设置当前请求能够接受的一些类型
   * https://github.com/jshttp/accepts/blob/2a6e060aebb52813fdb074e9e7f66da1cfa61902/index.js#L83
   * @param {String|Array} type(s)...
   * @return {String|Array|false}
   * @api public
   */

  accepts(...args) {
    return this.accept.types(...args);
  },

  /**
   * Return accepted encodings or best fit based on `encodings`.
   *
   * Given `Accept-Encoding: gzip, deflate`
   * an array sorted by quality is returned:
   *
   *     ['gzip', 'deflate']
   * 返回最匹配的编码格式
   * https://github.com/jshttp/accepts/blob/2a6e060aebb52813fdb074e9e7f66da1cfa61902/index.js#L127
   * @param {String|Array} encoding(s)...
   * @return {String|Array}
   * @api public
   */

  acceptsEncodings(...args) {
    return this.accept.encodings(...args);
  },

  /**
   * Return accepted charsets or best fit based on `charsets`.
   *
   * Given `Accept-Charset: utf-8, iso-8859-1;q=0.2, utf-7;q=0.5`
   * an array sorted by quality is returned:
   *
   *     ['utf-8', 'utf-7', 'iso-8859-1']
   * 返回最匹配的字符集
   * https://github.com/jshttp/accepts/blob/2a6e060aebb52813fdb074e9e7f66da1cfa61902/index.js#L160
   * @param {String|Array} charset(s)...
   * @return {String|Array}
   * @api public
   */

  acceptsCharsets(...args) {
    return this.accept.charsets(...args);
  },

  /**
   * Return accepted languages or best fit based on `langs`.
   *
   * Given `Accept-Language: en;q=0.8, es, pt`
   * an array sorted by quality is returned:
   *
   *     ['es', 'pt', 'en']
   * 返回最匹配的自然语言
   * https://github.com/jshttp/accepts/blob/2a6e060aebb52813fdb074e9e7f66da1cfa61902/index.js#L195
   * @param {String|Array} lang(s)...
   * @return {Array|String}
   * @api public
   */

  acceptsLanguages(...args) {
    return this.accept.languages(...args);
  },

  /**
   * Check if the incoming request contains the "Content-Type"
   * header field, and it contains any of the give mime `type`s.
   * If there is no request body, `null` is returned.
   * If there is no content type, `false` is returned.
   * Otherwise, it returns the first `type` that matches.
   *
   * Examples:
   *
   *     // With Content-Type: text/html; charset=utf-8
   *     this.is('html'); // => 'html'
   *     this.is('text/html'); // => 'text/html'
   *     this.is('text/*', 'application/json'); // => 'text/html'
   *
   *     // When Content-Type is application/json
   *     this.is('json', 'urlencoded'); // => 'json'
   *     this.is('application/json'); // => 'application/json'
   *     this.is('html', 'application/*'); // => 'application/json'
   *
   *     this.is('html'); // => false
   *
   * @param {String|Array} types...
   * @return {String|false|null}
   * @api public
   */

  is(types) {
    if (!types) return typeis(this.req);
    if (!Array.isArray(types)) types = [].slice.call(arguments);
    return typeis(this.req, types);
  },

  /**
   * Return the request mime type void of
   * parameters such as "charset".
   *
   * @return {String}
   * @api public
   */

  get type() {
    const type = this.get('Content-Type');
    if (!type) return '';
    return type.split(';')[0];
  },

  /**
   * Return request header.
   *
   * The `Referrer` header field is special-cased,
   * both `Referrer` and `Referer` are interchangeable.
   *
   * Examples:
   *
   *     this.get('Content-Type');
   *     // => "text/plain"
   *
   *     this.get('content-type');
   *     // => "text/plain"
   *
   *     this.get('Something');
   *     // => ''
   *
   * @param {String} field
   * @return {String}
   * @api public
   */

  get(field) {
    const req = this.req;
    switch (field = field.toLowerCase()) {
      case 'referer':
      case 'referrer':
        return req.headers.referrer || req.headers.referer || '';
      default:
        return req.headers[field] || '';
    }
  },

  /**
   * Inspect implementation.
   *
   * @return {Object}
   * @api public
   */

  inspect() {
    if (!this.req) return;
    return this.toJSON();
  },

  /**
   * Return JSON representation.
   *
   * @return {Object}
   * @api public
   */

  toJSON() {
    return only(this, [
      'method',
      'url',
      'header'
    ]);
  }
};

/**
 * Custom inspection implementation for newer Node.js versions.
 *
 * @return {Object}
 * @api public
 */

/* istanbul ignore else */
if (util.inspect.custom) {
  module.exports[util.inspect.custom] = module.exports.inspect;
}
