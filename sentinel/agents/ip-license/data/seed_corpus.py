#!/usr/bin/env python3
"""Generate the seed OSS fingerprint database from representative code patterns.

Run: cd agents/ip-license && .venv/bin/python data/seed_corpus.py
"""

from __future__ import annotations

import os
import sys

# Ensure the agent package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sentinel_license.corpus_builder import (  # noqa: E402
    build_corpus_for_package,
    RegistryPackage,
)
from sentinel_license.fingerprint_db import FingerprintDB  # noqa: E402

# ---------------------------------------------------------------------------
# Seed packages: 30+ curated + 90 generated across npm, PyPI, crates.io,
# Maven, RubyGems, Go.  Code snippets are representative algorithmic
# patterns, NOT exact copies.  Each snippet must be >= 12 lines so the
# 10-line sliding window produces at least 1 fingerprint.
# Phase 2 adds parametric generators for 10K+ corpus scale.
# ---------------------------------------------------------------------------

SEED_PACKAGES = [
    # ===================== npm (JavaScript) =====================
    {
        "name": "lodash",
        "ecosystem": "npm",
        "version": "4.17.21",
        "license": "MIT",
        "source_url": "https://github.com/lodash/lodash",
        "files": {
            "chunk.js": """\
function chunk(array, size) {
    size = Math.max(size, 0);
    const length = array == null ? 0 : array.length;
    if (!length || size < 1) {
        return [];
    }
    let index = 0;
    let resIndex = 0;
    const result = new Array(Math.ceil(length / size));
    while (index < length) {
        result[resIndex++] = array.slice(index, (index += size));
    }
    return result;
}
""",
            "debounce.js": """\
function debounce(func, wait, options) {
    let lastArgs, lastThis, maxWait, result, timerId, lastCallTime;
    let lastInvokeTime = 0;
    let leading = false;
    let maxing = false;
    let trailing = true;
    if (typeof func !== 'function') {
        throw new TypeError('Expected a function');
    }
    wait = Number(wait) || 0;
    if (typeof options === 'object') {
        leading = !!options.leading;
        maxing = 'maxWait' in options;
        maxWait = maxing ? Math.max(Number(options.maxWait) || 0, wait) : maxWait;
        trailing = 'trailing' in options ? !!options.trailing : trailing;
    }
    return result;
}
""",
        },
    },
    {
        "name": "express",
        "ecosystem": "npm",
        "version": "4.18.2",
        "license": "MIT",
        "source_url": "https://github.com/expressjs/express",
        "files": {
            "router.js": """\
function createRouter(options) {
    const params = {};
    const stack = [];
    function router(req, res, next) {
        let idx = 0;
        function nextLayer() {
            if (idx >= stack.length) {
                return next();
            }
            const layer = stack[idx++];
            if (layer.match(req.path)) {
                layer.handle(req, res, nextLayer);
            } else {
                nextLayer();
            }
        }
        nextLayer();
    }
    router.use = function use(path, handler) {
        stack.push({ path: path, match: makeMatcher(path), handle: handler });
        return router;
    };
    return router;
}
""",
        },
    },
    {
        "name": "axios",
        "ecosystem": "npm",
        "version": "1.6.0",
        "license": "MIT",
        "source_url": "https://github.com/axios/axios",
        "files": {
            "request.js": """\
function dispatchRequest(config) {
    const adapter = config.adapter || defaultAdapter;
    config.headers = normalizeHeaders(config.headers);
    config.data = transformData(config.data, config.headers, config.transformRequest);
    const fullUrl = buildURL(config.url, config.params, config.paramsSerializer);
    return adapter(config).then(function onFulfilled(response) {
        response.data = transformData(response.data, response.headers, config.transformResponse);
        return response;
    }, function onRejected(reason) {
        if (!isCancel(reason)) {
            reason.response.data = transformData(reason.response.data);
        }
        return Promise.reject(reason);
    });
}
""",
        },
    },
    {
        "name": "chalk",
        "ecosystem": "npm",
        "version": "5.3.0",
        "license": "MIT",
        "source_url": "https://github.com/chalk/chalk",
        "files": {
            "ansi-styles.js": """\
function createAnsiStyles() {
    const codes = new Map();
    const styles = {
        modifier: { reset: [0, 0], bold: [1, 22], dim: [2, 22], italic: [3, 23] },
        color: { black: [30, 39], red: [31, 39], green: [32, 39], yellow: [33, 39] },
        bgColor: { bgBlack: [40, 49], bgRed: [41, 49], bgGreen: [42, 49] }
    };
    for (const [groupName, group] of Object.entries(styles)) {
        for (const [styleName, style] of Object.entries(group)) {
            codes.set(styleName, { open: '\\u001B[' + style[0] + 'm', close: '\\u001B[' + style[1] + 'm' });
        }
    }
    return codes;
}
""",
        },
    },
    # ===================== PyPI (Python) =====================
    {
        "name": "flask",
        "ecosystem": "PyPI",
        "version": "3.0.0",
        "license": "BSD-3-Clause",
        "source_url": "https://github.com/pallets/flask",
        "files": {
            "app.py": """\
class FlaskApp:
    def __init__(self, import_name):
        self.import_name = import_name
        self.url_map = {}
        self.error_handlers = {}
        self.before_request_funcs = []
        self.after_request_funcs = []
        self.config = {}

    def route(self, rule, methods=None):
        def decorator(func):
            self.url_map[rule] = {
                'handler': func,
                'methods': methods or ['GET'],
            }
            return func
        return decorator

    def dispatch_request(self, environ):
        path = environ.get('PATH_INFO', '/')
        method = environ.get('REQUEST_METHOD', 'GET')
        handler_info = self.url_map.get(path)
        if handler_info is None:
            return self.handle_error(404)
        if method not in handler_info['methods']:
            return self.handle_error(405)
        return handler_info['handler']()
""",
        },
    },
    {
        "name": "requests",
        "ecosystem": "PyPI",
        "version": "2.31.0",
        "license": "Apache-2.0",
        "source_url": "https://github.com/psf/requests",
        "files": {
            "sessions.py": """\
class Session:
    def __init__(self):
        self.headers = {}
        self.cookies = {}
        self.auth = None
        self.timeout = None
        self.verify = True
        self.max_redirects = 30

    def prepare_request(self, method, url, **kwargs):
        headers = dict(self.headers)
        headers.update(kwargs.get('headers', {}))
        prepared = {
            'method': method.upper(),
            'url': url,
            'headers': headers,
            'data': kwargs.get('data'),
            'params': kwargs.get('params'),
        }
        return prepared

    def send(self, prepared, **kwargs):
        timeout = kwargs.get('timeout', self.timeout)
        verify = kwargs.get('verify', self.verify)
        adapter = self.get_adapter(prepared['url'])
        response = adapter.send(prepared, timeout=timeout, verify=verify)
        return response
""",
        },
    },
    {
        "name": "django",
        "ecosystem": "PyPI",
        "version": "5.0.0",
        "license": "BSD-3-Clause",
        "source_url": "https://github.com/django/django",
        "files": {
            "views.py": """\
class View:
    http_method_names = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)

    @classmethod
    def as_view(cls, **initkwargs):
        def view(request, *args, **kwargs):
            instance = cls(**initkwargs)
            instance.request = request
            instance.args = args
            instance.kwargs = kwargs
            return instance.dispatch(request, *args, **kwargs)
        return view

    def dispatch(self, request, *args, **kwargs):
        method = request.method.lower()
        if method in self.http_method_names:
            handler = getattr(self, method, self.http_method_not_allowed)
        else:
            handler = self.http_method_not_allowed
        return handler(request, *args, **kwargs)
""",
        },
    },
    {
        "name": "fastapi",
        "ecosystem": "PyPI",
        "version": "0.104.0",
        "license": "MIT",
        "source_url": "https://github.com/tiangolo/fastapi",
        "files": {
            "routing.py": """\
class APIRouter:
    def __init__(self, prefix='', tags=None):
        self.prefix = prefix
        self.tags = tags or []
        self.routes = []
        self.dependencies = []

    def add_api_route(self, path, endpoint, methods=None, status_code=200):
        route = {
            'path': self.prefix + path,
            'endpoint': endpoint,
            'methods': methods or ['GET'],
            'status_code': status_code,
            'tags': list(self.tags),
        }
        self.routes.append(route)
        return route

    def get(self, path, status_code=200):
        def decorator(func):
            self.add_api_route(path, func, methods=['GET'], status_code=status_code)
            return func
        return decorator

    def post(self, path, status_code=201):
        def decorator(func):
            self.add_api_route(path, func, methods=['POST'], status_code=status_code)
            return func
        return decorator
""",
        },
    },
    # ===================== crates.io (Rust) =====================
    {
        "name": "serde",
        "ecosystem": "crates.io",
        "version": "1.0.193",
        "license": "MIT OR Apache-2.0",
        "source_url": "https://github.com/serde-rs/serde",
        "files": {
            "serialize.rs": """\
pub trait Serializer {
    type Ok;
    type Error;
    fn serialize_bool(self, v: bool) -> Result<Self::Ok, Self::Error>;
    fn serialize_i8(self, v: i8) -> Result<Self::Ok, Self::Error>;
    fn serialize_i16(self, v: i16) -> Result<Self::Ok, Self::Error>;
    fn serialize_i32(self, v: i32) -> Result<Self::Ok, Self::Error>;
    fn serialize_i64(self, v: i64) -> Result<Self::Ok, Self::Error>;
    fn serialize_u8(self, v: u8) -> Result<Self::Ok, Self::Error>;
    fn serialize_u16(self, v: u16) -> Result<Self::Ok, Self::Error>;
    fn serialize_u32(self, v: u32) -> Result<Self::Ok, Self::Error>;
    fn serialize_u64(self, v: u64) -> Result<Self::Ok, Self::Error>;
    fn serialize_f32(self, v: f32) -> Result<Self::Ok, Self::Error>;
    fn serialize_f64(self, v: f64) -> Result<Self::Ok, Self::Error>;
    fn serialize_str(self, v: &str) -> Result<Self::Ok, Self::Error>;
    fn serialize_bytes(self, v: &[u8]) -> Result<Self::Ok, Self::Error>;
    fn serialize_none(self) -> Result<Self::Ok, Self::Error>;
}
""",
        },
    },
    {
        "name": "tokio",
        "ecosystem": "crates.io",
        "version": "1.35.0",
        "license": "MIT",
        "source_url": "https://github.com/tokio-rs/tokio",
        "files": {
            "runtime.rs": """\
pub struct Runtime {
    scheduler: Scheduler,
    handle: Handle,
    blocking_pool: BlockingPool,
}

impl Runtime {
    pub fn new() -> Result<Runtime, Error> {
        let scheduler = Scheduler::new(num_cpus());
        let handle = Handle::new(scheduler.clone());
        let blocking_pool = BlockingPool::new(512);
        Ok(Runtime { scheduler, handle, blocking_pool })
    }

    pub fn block_on<F: Future>(&self, future: F) -> F::Output {
        let _enter = self.handle.enter();
        self.scheduler.block_on(future)
    }

    pub fn spawn<F>(&self, future: F) -> JoinHandle<F::Output>
    where
        F: Future + Send + 'static,
        F::Output: Send + 'static,
    {
        self.handle.spawn(future)
    }
}
""",
        },
    },
    {
        "name": "clap",
        "ecosystem": "crates.io",
        "version": "4.4.11",
        "license": "MIT OR Apache-2.0",
        "source_url": "https://github.com/clap-rs/clap",
        "files": {
            "parser.rs": """\
pub struct ArgParser {
    args: Vec<ArgDef>,
    name: String,
    version: String,
    about: String,
}

impl ArgParser {
    pub fn new(name: &str) -> Self {
        ArgParser {
            args: Vec::new(),
            name: name.to_string(),
            version: String::new(),
            about: String::new(),
        }
    }

    pub fn arg(mut self, arg: ArgDef) -> Self {
        self.args.push(arg);
        self
    }

    pub fn parse(&self, input: &[String]) -> Result<Matches, ParseError> {
        let mut matches = Matches::new();
        let mut i = 0;
        while i < input.len() {
            let token = &input[i];
            if token.starts_with("--") {
                let name = &token[2..];
                if let Some(arg) = self.find_arg(name) {
                    if arg.takes_value {
                        i += 1;
                        matches.insert(name, &input[i]);
                    } else {
                        matches.set_flag(name);
                    }
                }
            }
            i += 1;
        }
        Ok(matches)
    }
}
""",
        },
    },
    # ===================== Maven (Java) =====================
    {
        "name": "spring-boot",
        "ecosystem": "Maven",
        "version": "3.2.0",
        "license": "Apache-2.0",
        "source_url": "https://github.com/spring-projects/spring-boot",
        "files": {
            "Application.java": """\
public class SpringApplication {
    private final Class<?> primarySource;
    private Map<String, Object> defaultProperties;
    private List<ApplicationListener> listeners;
    private ApplicationContextFactory contextFactory;

    public SpringApplication(Class<?> primarySource) {
        this.primarySource = primarySource;
        this.defaultProperties = new LinkedHashMap<>();
        this.listeners = new ArrayList<>();
        this.contextFactory = ApplicationContextFactory.DEFAULT;
    }

    public ConfigurableApplicationContext run(String[] args) {
        StopWatch stopWatch = new StopWatch();
        stopWatch.start();
        ConfigurableApplicationContext context = null;
        try {
            ApplicationArguments appArgs = new DefaultApplicationArguments(args);
            ConfigurableEnvironment env = prepareEnvironment(appArgs);
            context = createApplicationContext();
            prepareContext(context, env, appArgs);
            refreshContext(context);
            afterRefresh(context, appArgs);
        } catch (Throwable ex) {
            handleRunFailure(context, ex);
            throw new IllegalStateException(ex);
        }
        stopWatch.stop();
        return context;
    }
}
""",
        },
    },
    {
        "name": "guava",
        "ecosystem": "Maven",
        "version": "32.1.3-jre",
        "license": "Apache-2.0",
        "source_url": "https://github.com/google/guava",
        "files": {
            "ImmutableList.java": """\
public abstract class ImmutableList<E> implements List<E> {
    private final Object[] elements;
    private final int size;

    ImmutableList(Object[] elements, int size) {
        this.elements = elements;
        this.size = size;
    }

    public static <E> ImmutableList<E> of() {
        return new RegularImmutableList<>(new Object[0], 0);
    }

    public static <E> ImmutableList<E> of(E element) {
        return new RegularImmutableList<>(new Object[]{element}, 1);
    }

    public static <E> ImmutableList<E> copyOf(Collection<? extends E> elements) {
        Object[] array = elements.toArray();
        return new RegularImmutableList<>(array, array.length);
    }

    public E get(int index) {
        if (index < 0 || index >= size) {
            throw new IndexOutOfBoundsException("Index: " + index + ", Size: " + size);
        }
        return (E) elements[index];
    }

    public int size() {
        return size;
    }
}
""",
        },
    },
    {
        "name": "jackson-databind",
        "ecosystem": "Maven",
        "version": "2.16.0",
        "license": "Apache-2.0",
        "source_url": "https://github.com/FasterXML/jackson-databind",
        "files": {
            "ObjectMapper.java": """\
public class ObjectMapper {
    protected JsonFactory jsonFactory;
    protected SerializationConfig serializationConfig;
    protected DeserializationConfig deserializationConfig;

    public ObjectMapper() {
        this.jsonFactory = new JsonFactory();
        this.serializationConfig = new SerializationConfig();
        this.deserializationConfig = new DeserializationConfig();
    }

    public String writeValueAsString(Object value) throws JsonProcessingException {
        StringWriter writer = new StringWriter();
        JsonGenerator gen = jsonFactory.createGenerator(writer);
        serializeValue(gen, value);
        gen.flush();
        return writer.toString();
    }

    public <T> T readValue(String content, Class<T> valueType) throws JsonProcessingException {
        JsonParser parser = jsonFactory.createParser(content);
        return deserializeValue(parser, valueType);
    }

    public ObjectMapper configure(SerializationFeature feature, boolean state) {
        serializationConfig = state
            ? serializationConfig.with(feature)
            : serializationConfig.without(feature);
        return this;
    }
}
""",
        },
    },
    # ===================== RubyGems (Ruby) =====================
    {
        "name": "rails",
        "ecosystem": "RubyGems",
        "version": "7.1.2",
        "license": "MIT",
        "source_url": "https://github.com/rails/rails",
        "files": {
            "controller.rb": """\
class ActionController
  attr_reader :request, :response, :params

  def initialize(request)
    @request = request
    @response = Response.new
    @params = request.params.dup
    @filters_before = []
    @filters_after = []
  end

  def self.before_action(method_name, options = {})
    @filters_before ||= []
    @filters_before << { method: method_name, options: options }
  end

  def process_action(action_name)
    run_before_filters
    result = send(action_name)
    run_after_filters
    result
  end

  def render(options = {})
    if options[:json]
      @response.content_type = 'application/json'
      @response.body = options[:json].to_json
    elsif options[:html]
      @response.content_type = 'text/html'
      @response.body = options[:html]
    end
    @response
  end
end
""",
        },
    },
    {
        "name": "devise",
        "ecosystem": "RubyGems",
        "version": "4.9.3",
        "license": "MIT",
        "source_url": "https://github.com/heartcombo/devise",
        "files": {
            "authenticatable.rb": """\
module Authenticatable
  def self.included(base)
    base.extend(ClassMethods)
  end

  module ClassMethods
    def authenticate(email, password)
      user = find_by_email(email)
      return nil unless user
      return nil unless user.valid_password?(password)
      user
    end

    def find_by_email(email)
      where(email: email.downcase.strip).first
    end
  end

  def valid_password?(password)
    return false if encrypted_password.blank?
    bcrypt = BCrypt::Password.new(encrypted_password)
    bcrypt == password
  end

  def update_password(new_password)
    self.encrypted_password = BCrypt::Password.create(new_password, cost: 12)
    save
  end
end
""",
        },
    },
    {
        "name": "sidekiq",
        "ecosystem": "RubyGems",
        "version": "7.2.0",
        "license": "LGPL-3.0",
        "source_url": "https://github.com/sidekiq/sidekiq",
        "files": {
            "worker.rb": """\
module Sidekiq
  class Worker
    def self.included(base)
      base.extend(ClassMethods)
    end

    module ClassMethods
      def perform_async(*args)
        client = Sidekiq::Client.new
        client.push(
          'class' => self,
          'args' => args,
          'queue' => get_sidekiq_options['queue'],
          'retry' => get_sidekiq_options['retry']
        )
      end

      def perform_in(interval, *args)
        at = Time.now.to_f + interval.to_f
        client = Sidekiq::Client.new
        client.push(
          'class' => self,
          'args' => args,
          'at' => at,
          'queue' => get_sidekiq_options['queue']
        )
      end

      def sidekiq_options(opts = {})
        @sidekiq_options = get_sidekiq_options.merge(opts)
      end
    end
  end
end
""",
        },
    },
    # ===================== Go =====================
    {
        "name": "gin",
        "ecosystem": "Go",
        "version": "1.9.1",
        "license": "MIT",
        "source_url": "https://github.com/gin-gonic/gin",
        "files": {
            "engine.go": """\
type Engine struct {
	RouterGroup
	handlers HandlersChain
	pool     sync.Pool
	trees    methodTrees
	maxParams uint16
}

func New() *Engine {
	engine := &Engine{
		RouterGroup: RouterGroup{
			basePath: "/",
			root:     true,
		},
		trees: make(methodTrees, 0, 9),
	}
	engine.pool.New = func() interface{} {
		return engine.allocateContext()
	}
	return engine
}

func (engine *Engine) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	c := engine.pool.Get().(*Context)
	c.writermem.reset(w)
	c.Request = req
	c.reset()
	engine.handleHTTPRequest(c)
	engine.pool.Put(c)
}
""",
        },
    },
    {
        "name": "zap",
        "ecosystem": "Go",
        "version": "1.26.0",
        "license": "MIT",
        "source_url": "https://github.com/uber-go/zap",
        "files": {
            "logger.go": """\
type Logger struct {
	core zapcore.Core
	development bool
	addCaller   bool
	addStack    zapcore.LevelEnabler
	callerSkip  int
	name        string
}

func NewProduction(options ...Option) (*Logger, error) {
	config := NewProductionConfig()
	return config.Build(options...)
}

func (log *Logger) Info(msg string, fields ...Field) {
	if ce := log.check(InfoLevel, msg); ce != nil {
		ce.Write(fields...)
	}
}

func (log *Logger) Error(msg string, fields ...Field) {
	if ce := log.check(ErrorLevel, msg); ce != nil {
		ce.Write(fields...)
	}
}

func (log *Logger) With(fields ...Field) *Logger {
	if len(fields) == 0 {
		return log
	}
	clone := log.clone()
	clone.core = log.core.With(fields)
	return clone
}
""",
        },
    },
    {
        "name": "testify",
        "ecosystem": "Go",
        "version": "1.8.4",
        "license": "MIT",
        "source_url": "https://github.com/stretchr/testify",
        "files": {
            "assert.go": """\
func Equal(t TestingT, expected interface{}, actual interface{}, msgAndArgs ...interface{}) bool {
	if err := validateEqualArgs(expected, actual); err != nil {
		return Fail(t, fmt.Sprintf("Invalid operation: %#v == %#v (%s)", expected, actual, err), msgAndArgs...)
	}
	if !ObjectsAreEqual(expected, actual) {
		diff := diff(expected, actual)
		return Fail(t, fmt.Sprintf("Not equal: \\nexpected: %s\\nactual  : %s\\n%s", expected, actual, diff), msgAndArgs...)
	}
	return true
}

func NotNil(t TestingT, object interface{}, msgAndArgs ...interface{}) bool {
	if isNil(object) {
		return Fail(t, "Expected value not to be nil.", msgAndArgs...)
	}
	return true
}

func Contains(t TestingT, s interface{}, contains interface{}, msgAndArgs ...interface{}) bool {
	ok, found := containsElement(s, contains)
	if !ok {
		return Fail(t, fmt.Sprintf("Could not check %#v for %#v", s, contains), msgAndArgs...)
	}
	if !found {
		return Fail(t, fmt.Sprintf("%#v does not contain %#v", s, contains), msgAndArgs...)
	}
	return true
}
""",
        },
    },
    # ===================== Additional npm =====================
    {
        "name": "webpack",
        "ecosystem": "npm",
        "version": "5.89.0",
        "license": "MIT",
        "source_url": "https://github.com/webpack/webpack",
        "files": {
            "compiler.js": """\
class Compiler {
    constructor(context, options) {
        this.context = context;
        this.options = options;
        this.hooks = {
            compile: new SyncHook(['params']),
            emit: new AsyncSeriesHook(['compilation']),
            done: new AsyncSeriesHook(['stats']),
        };
        this.running = false;
        this.outputFileSystem = null;
    }

    run(callback) {
        if (this.running) {
            return callback(new Error('Compiler already running'));
        }
        this.running = true;
        const onCompiled = (err, compilation) => {
            if (err) return callback(err);
            this.hooks.emit.callAsync(compilation, (emitErr) => {
                if (emitErr) return callback(emitErr);
                this.emitAssets(compilation, (assetErr) => {
                    this.running = false;
                    callback(assetErr, new Stats(compilation));
                });
            });
        };
        this.compile(onCompiled);
    }
}
""",
        },
    },
    # ===================== Additional PyPI =====================
    {
        "name": "pytest",
        "ecosystem": "PyPI",
        "version": "7.4.3",
        "license": "MIT",
        "source_url": "https://github.com/pytest-dev/pytest",
        "files": {
            "runner.py": """\
class TestRunner:
    def __init__(self, config):
        self.config = config
        self.stats = {'passed': 0, 'failed': 0, 'skipped': 0, 'error': 0}

    def run_tests(self, items):
        for item in items:
            self.run_single_test(item)
        return self.stats

    def run_single_test(self, item):
        try:
            self.call_setup(item)
            self.call_test(item)
            self.call_teardown(item)
            self.stats['passed'] += 1
        except SkipException:
            self.stats['skipped'] += 1
        except AssertionError:
            self.stats['failed'] += 1
        except Exception:
            self.stats['error'] += 1

    def call_setup(self, item):
        if hasattr(item, 'setup'):
            item.setup()

    def call_test(self, item):
        item.runtest()

    def call_teardown(self, item):
        if hasattr(item, 'teardown'):
            item.teardown()
""",
        },
    },
    # ===================== Additional crates.io =====================
    {
        "name": "actix-web",
        "ecosystem": "crates.io",
        "version": "4.4.0",
        "license": "MIT OR Apache-2.0",
        "source_url": "https://github.com/actix/actix-web",
        "files": {
            "server.rs": """\
pub struct HttpServer {
    factory: Box<dyn ServiceFactory>,
    workers: usize,
    backlog: u32,
    addrs: Vec<SocketAddr>,
    tls_config: Option<TlsConfig>,
}

impl HttpServer {
    pub fn new<F>(factory: F) -> Self
    where
        F: ServiceFactory + 'static,
    {
        HttpServer {
            factory: Box::new(factory),
            workers: num_cpus::get(),
            backlog: 2048,
            addrs: Vec::new(),
            tls_config: None,
        }
    }

    pub fn bind(mut self, addr: &str) -> Result<Self, Error> {
        let socket_addr: SocketAddr = addr.parse()?;
        self.addrs.push(socket_addr);
        Ok(self)
    }

    pub fn workers(mut self, num: usize) -> Self {
        self.workers = num;
        self
    }

    pub async fn run(self) -> Result<(), Error> {
        let mut handles = Vec::new();
        for _ in 0..self.workers {
            let factory = self.factory.clone();
            let handle = tokio::spawn(async move {
                let service = factory.new_service(()).await;
                service.run().await
            });
            handles.push(handle);
        }
        futures::future::try_join_all(handles).await?;
        Ok(())
    }
}
""",
        },
    },
    # ===================== PHASE 2: Expanded Corpus =====================
    # Additional npm packages
    {
        "name": "react",
        "ecosystem": "npm",
        "version": "18.2.0",
        "license": "MIT",
        "source_url": "https://github.com/facebook/react",
        "files": {
            "reconciler.js": """\
class FiberNode {
    constructor(tag, pendingProps, key, mode) {
        this.tag = tag;
        this.key = key;
        this.elementType = null;
        this.type = null;
        this.stateNode = null;
        this.return = null;
        this.child = null;
        this.sibling = null;
        this.index = 0;
        this.ref = null;
        this.pendingProps = pendingProps;
        this.memoizedProps = null;
        this.updateQueue = null;
        this.memoizedState = null;
        this.dependencies = null;
        this.mode = mode;
        this.flags = 0;
        this.subtreeFlags = 0;
        this.deletions = null;
        this.lanes = 0;
        this.childLanes = 0;
        this.alternate = null;
    }
}

function createFiber(tag, pendingProps, key, mode) {
    return new FiberNode(tag, pendingProps, key, mode);
}

function createWorkInProgress(current, pendingProps) {
    let workInProgress = current.alternate;
    if (workInProgress === null) {
        workInProgress = createFiber(current.tag, pendingProps, current.key, current.mode);
        workInProgress.elementType = current.elementType;
        workInProgress.type = current.type;
        workInProgress.stateNode = current.stateNode;
        workInProgress.alternate = current;
        current.alternate = workInProgress;
    } else {
        workInProgress.pendingProps = pendingProps;
        workInProgress.type = current.type;
        workInProgress.flags = 0;
        workInProgress.subtreeFlags = 0;
        workInProgress.deletions = null;
    }
    workInProgress.flags = current.flags;
    workInProgress.childLanes = current.childLanes;
    workInProgress.lanes = current.lanes;
    workInProgress.child = current.child;
    workInProgress.memoizedProps = current.memoizedProps;
    workInProgress.memoizedState = current.memoizedState;
    workInProgress.updateQueue = current.updateQueue;
    workInProgress.sibling = current.sibling;
    workInProgress.index = current.index;
    workInProgress.ref = current.ref;
    return workInProgress;
}

function beginWork(current, workInProgress, renderLanes) {
    workInProgress.lanes = 0;
    switch (workInProgress.tag) {
        case 0:
            return updateFunctionComponent(current, workInProgress, renderLanes);
        case 1:
            return updateClassComponent(current, workInProgress, renderLanes);
        case 3:
            return updateHostRoot(current, workInProgress, renderLanes);
        case 5:
            return updateHostComponent(current, workInProgress, renderLanes);
        case 6:
            return updateHostText(current, workInProgress);
        case 13:
            return updateSuspenseComponent(current, workInProgress, renderLanes);
        default:
            return null;
    }
}
""",
            "hooks.js": """\
let currentlyRenderingFiber = null;
let workInProgressHook = null;
let currentHook = null;

function mountWorkInProgressHook() {
    const hook = {
        memoizedState: null,
        baseState: null,
        baseQueue: null,
        queue: null,
        next: null,
    };
    if (workInProgressHook === null) {
        currentlyRenderingFiber.memoizedState = workInProgressHook = hook;
    } else {
        workInProgressHook = workInProgressHook.next = hook;
    }
    return workInProgressHook;
}

function updateWorkInProgressHook() {
    let nextCurrentHook;
    if (currentHook === null) {
        const current = currentlyRenderingFiber.alternate;
        nextCurrentHook = current !== null ? current.memoizedState : null;
    } else {
        nextCurrentHook = currentHook.next;
    }
    currentHook = nextCurrentHook;
    const newHook = {
        memoizedState: currentHook.memoizedState,
        baseState: currentHook.baseState,
        baseQueue: currentHook.baseQueue,
        queue: currentHook.queue,
        next: null,
    };
    if (workInProgressHook === null) {
        currentlyRenderingFiber.memoizedState = workInProgressHook = newHook;
    } else {
        workInProgressHook = workInProgressHook.next = newHook;
    }
    return workInProgressHook;
}

function mountState(initialState) {
    const hook = mountWorkInProgressHook();
    if (typeof initialState === 'function') {
        initialState = initialState();
    }
    hook.memoizedState = hook.baseState = initialState;
    const queue = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: basicStateReducer,
        lastRenderedState: initialState,
    };
    hook.queue = queue;
    const dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue);
    queue.dispatch = dispatch;
    return [hook.memoizedState, dispatch];
}

function mountEffect(create, deps) {
    return mountEffectImpl(0 | 1, 8, create, deps);
}

function mountEffectImpl(fiberFlags, hookFlags, create, deps) {
    const hook = mountWorkInProgressHook();
    const nextDeps = deps === undefined ? null : deps;
    currentlyRenderingFiber.flags |= fiberFlags;
    hook.memoizedState = pushEffect(1 | hookFlags, create, undefined, nextDeps);
}
""",
            "scheduler.js": """\
const taskQueue = [];
const timerQueue = [];
let taskIdCounter = 1;
let currentTask = null;
let currentPriorityLevel = 3;
let isPerformingWork = false;
let isHostCallbackScheduled = false;
let isMessageLoopRunning = false;

function unstable_scheduleCallback(priorityLevel, callback, options) {
    const currentTime = getCurrentTime();
    let startTime;
    if (typeof options === 'object' && options !== null) {
        const delay = options.delay;
        startTime = typeof delay === 'number' && delay > 0 ? currentTime + delay : currentTime;
    } else {
        startTime = currentTime;
    }
    let timeout;
    switch (priorityLevel) {
        case 1: timeout = -1; break;
        case 2: timeout = 250; break;
        case 5: timeout = 1073741823; break;
        case 4: timeout = 10000; break;
        case 3:
        default: timeout = 5000; break;
    }
    const expirationTime = startTime + timeout;
    const newTask = {
        id: taskIdCounter++,
        callback,
        priorityLevel,
        startTime,
        expirationTime,
        sortIndex: -1,
    };
    if (startTime > currentTime) {
        newTask.sortIndex = startTime;
        push(timerQueue, newTask);
        if (peek(taskQueue) === null && newTask === peek(timerQueue)) {
            requestHostTimeout(handleTimeout, startTime - currentTime);
        }
    } else {
        newTask.sortIndex = expirationTime;
        push(taskQueue, newTask);
        if (!isHostCallbackScheduled && !isPerformingWork) {
            isHostCallbackScheduled = true;
            requestHostCallback(flushWork);
        }
    }
    return newTask;
}

function flushWork(hasTimeRemaining, initialTime) {
    isHostCallbackScheduled = false;
    isPerformingWork = true;
    const previousPriorityLevel = currentPriorityLevel;
    try {
        return workLoop(hasTimeRemaining, initialTime);
    } finally {
        currentTask = null;
        currentPriorityLevel = previousPriorityLevel;
        isPerformingWork = false;
    }
}

function workLoop(hasTimeRemaining, initialTime) {
    let currentTime = initialTime;
    advanceTimers(currentTime);
    currentTask = peek(taskQueue);
    while (currentTask !== null) {
        if (currentTask.expirationTime > currentTime && (!hasTimeRemaining || shouldYieldToHost())) {
            break;
        }
        const callback = currentTask.callback;
        if (typeof callback === 'function') {
            currentTask.callback = null;
            currentPriorityLevel = currentTask.priorityLevel;
            const didUserCallbackTimeout = currentTask.expirationTime <= currentTime;
            const continuationCallback = callback(didUserCallbackTimeout);
            currentTime = getCurrentTime();
            if (typeof continuationCallback === 'function') {
                currentTask.callback = continuationCallback;
            } else {
                if (currentTask === peek(taskQueue)) {
                    pop(taskQueue);
                }
            }
            advanceTimers(currentTime);
        } else {
            pop(taskQueue);
        }
        currentTask = peek(taskQueue);
    }
    return currentTask !== null;
}
""",
        },
    },
    {
        "name": "vue",
        "ecosystem": "npm",
        "version": "3.4.0",
        "license": "MIT",
        "source_url": "https://github.com/vuejs/core",
        "files": {
            "reactivity.js": """\
const targetMap = new WeakMap();
let activeEffect = null;
let shouldTrack = true;
const effectStack = [];

function track(target, type, key) {
    if (!shouldTrack || activeEffect === null) return;
    let depsMap = targetMap.get(target);
    if (!depsMap) {
        targetMap.set(target, (depsMap = new Map()));
    }
    let dep = depsMap.get(key);
    if (!dep) {
        depsMap.set(key, (dep = new Set()));
    }
    if (!dep.has(activeEffect)) {
        dep.add(activeEffect);
        activeEffect.deps.push(dep);
    }
}

function trigger(target, type, key, newValue, oldValue) {
    const depsMap = targetMap.get(target);
    if (!depsMap) return;
    const effects = new Set();
    const add = (effectsToAdd) => {
        if (effectsToAdd) {
            effectsToAdd.forEach(effect => {
                if (effect !== activeEffect || effect.allowRecurse) {
                    effects.add(effect);
                }
            });
        }
    };
    if (type === 'clear') {
        depsMap.forEach(add);
    } else if (key === 'length' && Array.isArray(target)) {
        depsMap.forEach((dep, depKey) => {
            if (depKey === 'length' || depKey >= newValue) {
                add(dep);
            }
        });
    } else {
        if (key !== undefined) {
            add(depsMap.get(key));
        }
    }
    const run = (effect) => {
        if (effect.scheduler) {
            effect.scheduler();
        } else {
            effect.run();
        }
    };
    effects.forEach(run);
}

function reactive(target) {
    if (target && target.__v_isReactive) return target;
    return createReactiveObject(target, false, mutableHandlers, mutableCollectionHandlers);
}

function createReactiveObject(target, isReadonly, baseHandlers, collectionHandlers) {
    if (typeof target !== 'object' || target === null) return target;
    const proxy = new Proxy(target, baseHandlers);
    return proxy;
}

function ref(value) {
    return createRef(value, false);
}

function createRef(rawValue, shallow) {
    if (isRef(rawValue)) return rawValue;
    return new RefImpl(rawValue, shallow);
}

class RefImpl {
    constructor(value, isShallow) {
        this.__v_isRef = true;
        this._rawValue = isShallow ? value : toRaw(value);
        this._value = isShallow ? value : toReactive(value);
    }
    get value() {
        track(this, 'get', 'value');
        return this._value;
    }
    set value(newVal) {
        const oldVal = this._rawValue;
        if (hasChanged(newVal, oldVal)) {
            this._rawValue = newVal;
            this._value = toReactive(newVal);
            trigger(this, 'set', 'value', newVal, oldVal);
        }
    }
}
""",
            "vdom.js": """\
function createVNode(type, props, children, patchFlag, dynamicProps) {
    const shapeFlag = typeof type === 'string' ? 1 : typeof type === 'object' ? 4 : typeof type === 'function' ? 2 : 0;
    const vnode = {
        __v_isVNode: true,
        type,
        props,
        key: props && props.key != null ? props.key : null,
        ref: props && props.ref,
        children: null,
        component: null,
        suspense: null,
        el: null,
        anchor: null,
        target: null,
        shapeFlag,
        patchFlag: patchFlag || 0,
        dynamicProps: dynamicProps || null,
        dynamicChildren: null,
        appContext: null,
    };
    normalizeChildren(vnode, children);
    return vnode;
}

function normalizeChildren(vnode, children) {
    let type = 0;
    if (children == null) {
        children = null;
    } else if (Array.isArray(children)) {
        type = 16;
    } else if (typeof children === 'object') {
        type = 32;
    } else if (typeof children === 'function') {
        type = 32;
        children = { default: children };
    } else {
        children = String(children);
        type = 8;
    }
    vnode.children = children;
    vnode.shapeFlag |= type;
}

function patch(n1, n2, container, anchor, parentComponent) {
    if (n1 === n2) return;
    if (n1 && !isSameVNodeType(n1, n2)) {
        unmount(n1, parentComponent);
        n1 = null;
    }
    const { type, shapeFlag } = n2;
    switch (type) {
        case Text:
            processText(n1, n2, container, anchor);
            break;
        case Comment:
            processCommentNode(n1, n2, container, anchor);
            break;
        case Fragment:
            processFragment(n1, n2, container, anchor, parentComponent);
            break;
        default:
            if (shapeFlag & 1) {
                processElement(n1, n2, container, anchor, parentComponent);
            } else if (shapeFlag & 6) {
                processComponent(n1, n2, container, anchor, parentComponent);
            }
    }
}

function processElement(n1, n2, container, anchor, parentComponent) {
    if (n1 == null) {
        mountElement(n2, container, anchor, parentComponent);
    } else {
        patchElement(n1, n2, parentComponent);
    }
}

function mountElement(vnode, container, anchor, parentComponent) {
    const el = (vnode.el = document.createElement(vnode.type));
    const { props, shapeFlag, children } = vnode;
    if (props) {
        for (const key in props) {
            patchProp(el, key, null, props[key]);
        }
    }
    if (shapeFlag & 8) {
        el.textContent = children;
    } else if (shapeFlag & 16) {
        mountChildren(children, el, null, parentComponent);
    }
    container.insertBefore(el, anchor || null);
}
""",
        },
    },
    {
        "name": "next",
        "ecosystem": "npm",
        "version": "14.0.0",
        "license": "MIT",
        "source_url": "https://github.com/vercel/next.js",
        "files": {
            "router.js": """\
class AppRouter {
    constructor(initialTree, initialHead, urlParts) {
        this.tree = initialTree;
        this.head = initialHead;
        this.pendingNavigation = null;
        this.canonicalUrl = urlParts.pathname + urlParts.search;
        this.pushRef = { pendingPush: false, mpaNavigation: false };
        this.focusAndScrollRef = { apply: false, hashFragment: null };
        this.cache = new Map();
        this.prefetchCache = new Map();
        this.nextUrl = null;
    }

    push(href, options) {
        this.navigate(href, 'push', options);
    }

    replace(href, options) {
        this.navigate(href, 'replace', options);
    }

    navigate(href, navigateType, options) {
        const url = new URL(href, window.location.origin);
        const isExternalUrl = url.origin !== window.location.origin;
        if (isExternalUrl) {
            window.location.href = href;
            return;
        }
        this.pendingNavigation = {
            href,
            navigateType,
            forceOptimisticNavigation: options?.forceOptimisticNavigation ?? false,
        };
        this.startTransition(() => {
            this.dispatch({
                type: 'navigate',
                url: url,
                navigateType,
                forceOptimisticNavigation: options?.forceOptimisticNavigation ?? false,
                isExternalUrl: false,
                locationSearch: url.search,
            });
        });
    }

    prefetch(href) {
        if (this.prefetchCache.has(href)) return;
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        const prefetchEntry = {
            treeAtTimeOfPrefetch: this.tree,
            data: null,
            kind: 'auto',
            lastUsedTime: Date.now(),
        };
        this.prefetchCache.set(href, prefetchEntry);
    }

    back() {
        window.history.back();
    }

    forward() {
        window.history.forward();
    }

    refresh() {
        this.dispatch({ type: 'server-patch', previousTree: this.tree, flightData: null, overrideCanonicalUrl: null });
    }
}
""",
        },
    },
    {
        "name": "svelte",
        "ecosystem": "npm",
        "version": "4.2.0",
        "license": "MIT",
        "source_url": "https://github.com/sveltejs/svelte",
        "files": {
            "runtime.js": """\
let current_component = null;
const dirty_components = [];
const binding_callbacks = [];
const render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = Promise.resolve();
let update_scheduled = false;

function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}

function add_render_callback(fn) {
    render_callbacks.push(fn);
}

function flush() {
    const seen_callbacks = new Set();
    do {
        while (dirty_components.length) {
            const component = dirty_components.shift();
            set_current_component(component);
            update(component.$$);
        }
        while (binding_callbacks.length) binding_callbacks.pop()();
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
}

function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}

function mount_component(component, target, anchor) {
    const $$ = component.$$;
    $$.fragment && $$.fragment.m(target, anchor);
    add_render_callback(() => {
        const new_on_destroy = $$.on_mount.map(run).filter(is_function);
        if ($$.on_destroy) {
            $$.on_destroy.push(...new_on_destroy);
        } else {
            run_all(new_on_destroy);
        }
        component.$$.on_mount = [];
    });
}

function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
""",
        },
    },
    {
        "name": "esbuild",
        "ecosystem": "npm",
        "version": "0.19.0",
        "license": "MIT",
        "source_url": "https://github.com/evanw/esbuild",
        "files": {
            "bundler.js": """\
class Bundler {
    constructor(options) {
        this.entryPoints = options.entryPoints || [];
        this.outdir = options.outdir || 'dist';
        this.format = options.format || 'esm';
        this.platform = options.platform || 'browser';
        this.minify = options.minify || false;
        this.sourcemap = options.sourcemap || false;
        this.target = options.target || 'es2020';
        this.external = options.external || [];
        this.plugins = options.plugins || [];
        this.loader = options.loader || {};
        this.define = options.define || {};
        this.resolveCache = new Map();
        this.moduleGraph = new Map();
    }

    async build() {
        const result = { errors: [], warnings: [], outputFiles: [] };
        try {
            for (const entry of this.entryPoints) {
                const resolved = await this.resolve(entry, '.');
                const module = await this.load(resolved);
                const deps = this.analyzeDependencies(module);
                for (const dep of deps) {
                    const depResolved = await this.resolve(dep, resolved);
                    if (!this.moduleGraph.has(depResolved)) {
                        const depModule = await this.load(depResolved);
                        this.moduleGraph.set(depResolved, depModule);
                    }
                }
                this.moduleGraph.set(resolved, module);
            }
            const chunks = this.createChunks();
            for (const chunk of chunks) {
                const output = this.generateOutput(chunk);
                if (this.minify) {
                    output.code = this.minifyCode(output.code);
                }
                result.outputFiles.push(output);
            }
        } catch (error) {
            result.errors.push({ text: error.message, location: null });
        }
        return result;
    }

    async resolve(specifier, importer) {
        const cacheKey = specifier + ':' + importer;
        if (this.resolveCache.has(cacheKey)) {
            return this.resolveCache.get(cacheKey);
        }
        for (const plugin of this.plugins) {
            if (plugin.setup && plugin.setup.onResolve) {
                const result = plugin.setup.onResolve({ path: specifier, importer });
                if (result) {
                    this.resolveCache.set(cacheKey, result.path);
                    return result.path;
                }
            }
        }
        if (this.external.includes(specifier)) {
            return null;
        }
        const resolved = specifier;
        this.resolveCache.set(cacheKey, resolved);
        return resolved;
    }
}
""",
        },
    },
    # Additional PyPI packages
    {
        "name": "numpy",
        "ecosystem": "PyPI",
        "version": "1.26.0",
        "license": "BSD-3-Clause",
        "source_url": "https://github.com/numpy/numpy",
        "files": {
            "ndarray.py": """\
class ndarray:
    def __init__(self, shape, dtype=None, buffer=None, offset=0, strides=None, order=None):
        self.shape = tuple(shape) if hasattr(shape, '__iter__') else (shape,)
        self.dtype = dtype or float64
        self.ndim = len(self.shape)
        self.size = 1
        for s in self.shape:
            self.size *= s
        self.strides = strides or self._compute_strides(self.shape, self.dtype)
        self.data = buffer if buffer is not None else bytearray(self.size * self.dtype.itemsize)
        self.offset = offset
        self.base = None
        self.flags = {'C_CONTIGUOUS': True, 'F_CONTIGUOUS': False, 'OWNDATA': buffer is None}

    def _compute_strides(self, shape, dtype):
        strides = [dtype.itemsize]
        for s in reversed(shape[1:]):
            strides.insert(0, strides[0] * s)
        return tuple(strides)

    def __getitem__(self, key):
        if isinstance(key, int):
            if key < 0:
                key += self.shape[0]
            if key < 0 or key >= self.shape[0]:
                raise IndexError('index out of bounds')
            new_offset = self.offset + key * self.strides[0]
            if self.ndim == 1:
                return self._get_scalar(new_offset)
            return ndarray(self.shape[1:], self.dtype, self.data, new_offset, self.strides[1:])
        elif isinstance(key, slice):
            start, stop, step = key.indices(self.shape[0])
            new_shape = ((stop - start + step - 1) // step,) + self.shape[1:]
            new_strides = (self.strides[0] * step,) + self.strides[1:]
            new_offset = self.offset + start * self.strides[0]
            return ndarray(new_shape, self.dtype, self.data, new_offset, new_strides)
        raise TypeError(f'invalid index type: {type(key)}')

    def reshape(self, *new_shape):
        if len(new_shape) == 1 and hasattr(new_shape[0], '__iter__'):
            new_shape = tuple(new_shape[0])
        new_size = 1
        neg_idx = -1
        for i, s in enumerate(new_shape):
            if s == -1:
                if neg_idx >= 0:
                    raise ValueError('only one dimension can be -1')
                neg_idx = i
            else:
                new_size *= s
        if neg_idx >= 0:
            new_shape = list(new_shape)
            new_shape[neg_idx] = self.size // new_size
            new_shape = tuple(new_shape)
        if self.size != new_size * (new_shape[neg_idx] if neg_idx >= 0 else 1):
            raise ValueError('cannot reshape array of size {} into shape {}'.format(self.size, new_shape))
        return ndarray(new_shape, self.dtype, self.data, self.offset)

    def transpose(self, *axes):
        if not axes:
            axes = tuple(range(self.ndim - 1, -1, -1))
        elif len(axes) == 1 and hasattr(axes[0], '__iter__'):
            axes = tuple(axes[0])
        new_shape = tuple(self.shape[i] for i in axes)
        new_strides = tuple(self.strides[i] for i in axes)
        result = ndarray(new_shape, self.dtype, self.data, self.offset, new_strides)
        result.base = self
        return result

    @property
    def T(self):
        return self.transpose()
""",
            "linalg.py": """\
def dot(a, b):
    if a.ndim == 1 and b.ndim == 1:
        if a.shape[0] != b.shape[0]:
            raise ValueError('shapes not aligned')
        result = 0.0
        for i in range(a.shape[0]):
            result += a[i] * b[i]
        return result
    elif a.ndim == 2 and b.ndim == 2:
        if a.shape[1] != b.shape[0]:
            raise ValueError('shapes not aligned: {} vs {}'.format(a.shape, b.shape))
        m, k = a.shape
        n = b.shape[1]
        result = zeros((m, n))
        for i in range(m):
            for j in range(n):
                s = 0.0
                for p in range(k):
                    s += a[i, p] * b[p, j]
                result[i, j] = s
        return result
    raise ValueError('unsupported dimensions')

def matmul(a, b):
    return dot(a, b)

def solve(A, b):
    n = A.shape[0]
    augmented = zeros((n, n + 1))
    for i in range(n):
        for j in range(n):
            augmented[i, j] = A[i, j]
        augmented[i, n] = b[i]
    for col in range(n):
        max_row = col
        for row in range(col + 1, n):
            if abs(augmented[row, col]) > abs(augmented[max_row, col]):
                max_row = row
        if max_row != col:
            for j in range(n + 1):
                augmented[col, j], augmented[max_row, j] = augmented[max_row, j], augmented[col, j]
        pivot = augmented[col, col]
        if abs(pivot) < 1e-12:
            raise ValueError('singular matrix')
        for j in range(col, n + 1):
            augmented[col, j] /= pivot
        for row in range(n):
            if row != col:
                factor = augmented[row, col]
                for j in range(col, n + 1):
                    augmented[row, j] -= factor * augmented[col, j]
    x = zeros(n)
    for i in range(n):
        x[i] = augmented[i, n]
    return x

def inv(A):
    n = A.shape[0]
    if A.shape[0] != A.shape[1]:
        raise ValueError('matrix must be square')
    result = zeros((n, n))
    identity = eye(n)
    for col in range(n):
        b = identity[:, col]
        result[:, col] = solve(A, b)
    return result

def det(A):
    n = A.shape[0]
    if n == 1:
        return A[0, 0]
    if n == 2:
        return A[0, 0] * A[1, 1] - A[0, 1] * A[1, 0]
    result = 0.0
    for j in range(n):
        minor = zeros((n - 1, n - 1))
        for i in range(1, n):
            col = 0
            for k in range(n):
                if k == j:
                    continue
                minor[i - 1, col] = A[i, k]
                col += 1
        sign = 1 if j % 2 == 0 else -1
        result += sign * A[0, j] * det(minor)
    return result
""",
        },
    },
    {
        "name": "pandas",
        "ecosystem": "PyPI",
        "version": "2.1.0",
        "license": "BSD-3-Clause",
        "source_url": "https://github.com/pandas-dev/pandas",
        "files": {
            "dataframe.py": """\
class DataFrame:
    def __init__(self, data=None, index=None, columns=None, dtype=None):
        if data is None:
            self._data = {}
            self._columns = []
            self._index = index or []
        elif isinstance(data, dict):
            self._columns = list(data.keys()) if columns is None else list(columns)
            self._data = {}
            max_len = 0
            for key in self._columns:
                col_data = data.get(key, [])
                if hasattr(col_data, '__len__'):
                    max_len = max(max_len, len(col_data))
                self._data[key] = list(col_data) if hasattr(col_data, '__iter__') else [col_data]
            self._index = index or list(range(max_len))
            for key in self._columns:
                while len(self._data[key]) < max_len:
                    self._data[key].append(None)
        elif isinstance(data, list):
            if data and isinstance(data[0], dict):
                all_keys = set()
                for row in data:
                    all_keys.update(row.keys())
                self._columns = sorted(all_keys) if columns is None else list(columns)
                self._data = {col: [] for col in self._columns}
                for row in data:
                    for col in self._columns:
                        self._data[col].append(row.get(col))
                self._index = index or list(range(len(data)))
            else:
                self._columns = columns or list(range(len(data[0]) if data else 0))
                self._data = {col: [] for col in self._columns}
                for row in data:
                    for i, col in enumerate(self._columns):
                        self._data[col].append(row[i] if i < len(row) else None)
                self._index = index or list(range(len(data)))
        self.dtype = dtype

    def __getitem__(self, key):
        if isinstance(key, str):
            if key not in self._data:
                raise KeyError(key)
            return Series(self._data[key], index=self._index, name=key)
        elif isinstance(key, list):
            new_data = {k: self._data[k] for k in key if k in self._data}
            return DataFrame(new_data, index=self._index, columns=key)
        raise TypeError(f'invalid key type: {type(key)}')

    def __setitem__(self, key, value):
        if isinstance(value, (list, tuple)):
            if len(value) != len(self._index):
                raise ValueError('length mismatch')
            self._data[key] = list(value)
        else:
            self._data[key] = [value] * len(self._index)
        if key not in self._columns:
            self._columns.append(key)

    def head(self, n=5):
        new_data = {col: self._data[col][:n] for col in self._columns}
        return DataFrame(new_data, index=self._index[:n], columns=self._columns)

    def tail(self, n=5):
        new_data = {col: self._data[col][-n:] for col in self._columns}
        return DataFrame(new_data, index=self._index[-n:], columns=self._columns)

    def groupby(self, by):
        groups = {}
        col_data = self._data[by]
        for i, val in enumerate(col_data):
            if val not in groups:
                groups[val] = []
            groups[val].append(i)
        return GroupBy(self, groups, by)

    def merge(self, right, on=None, how='inner'):
        if on is None:
            on = list(set(self._columns) & set(right._columns))
        left_idx = {}
        for i, row_idx in enumerate(self._index):
            key = tuple(self._data[col][i] for col in on)
            left_idx.setdefault(key, []).append(i)
        right_idx = {}
        for i, row_idx in enumerate(right._index):
            key = tuple(right._data[col][i] for col in on)
            right_idx.setdefault(key, []).append(i)
        result_data = {col: [] for col in self._columns}
        for col in right._columns:
            if col not in result_data:
                result_data[col] = []
        if how == 'inner':
            for key in left_idx:
                if key in right_idx:
                    for li in left_idx[key]:
                        for ri in right_idx[key]:
                            for col in self._columns:
                                result_data[col].append(self._data[col][li])
                            for col in right._columns:
                                if col not in self._columns:
                                    result_data[col].append(right._data[col][ri])
        return DataFrame(result_data)
""",
        },
    },
    {
        "name": "sqlalchemy",
        "ecosystem": "PyPI",
        "version": "2.0.23",
        "license": "MIT",
        "source_url": "https://github.com/sqlalchemy/sqlalchemy",
        "files": {
            "engine.py": """\
class Engine:
    def __init__(self, url, pool_size=5, max_overflow=10, echo=False):
        self.url = url
        self.pool_size = pool_size
        self.max_overflow = max_overflow
        self.echo = echo
        self.pool = ConnectionPool(pool_size, max_overflow)
        self.dialect = self._create_dialect(url)
        self.logger = logging.getLogger('sqlalchemy.engine')

    def _create_dialect(self, url):
        scheme = url.split('://')[0] if '://' in url else 'sqlite'
        dialects = {
            'postgresql': PostgreSQLDialect,
            'mysql': MySQLDialect,
            'sqlite': SQLiteDialect,
            'oracle': OracleDialect,
        }
        dialect_class = dialects.get(scheme)
        if dialect_class is None:
            raise ValueError(f'unsupported dialect: {scheme}')
        return dialect_class()

    def connect(self):
        conn = self.pool.checkout()
        if self.echo:
            self.logger.info('Connection checked out from pool')
        return Connection(self, conn)

    def execute(self, statement, parameters=None):
        with self.connect() as conn:
            return conn.execute(statement, parameters)

    def begin(self):
        conn = self.connect()
        conn.begin()
        return conn

    def dispose(self):
        self.pool.dispose()


class Session:
    def __init__(self, engine, autocommit=False, autoflush=True):
        self.engine = engine
        self.autocommit = autocommit
        self.autoflush = autoflush
        self._new = set()
        self._dirty = set()
        self._deleted = set()
        self._identity_map = {}
        self._transaction = None

    def add(self, instance):
        key = self._identity_key(instance)
        if key in self._identity_map:
            return
        self._new.add(instance)
        self._identity_map[key] = instance

    def delete(self, instance):
        key = self._identity_key(instance)
        if key in self._identity_map:
            self._deleted.add(instance)
            self._new.discard(instance)

    def flush(self):
        if self._new:
            for obj in list(self._new):
                self._persist_new(obj)
            self._new.clear()
        if self._dirty:
            for obj in list(self._dirty):
                self._persist_dirty(obj)
            self._dirty.clear()
        if self._deleted:
            for obj in list(self._deleted):
                self._persist_deleted(obj)
            self._deleted.clear()

    def commit(self):
        if self.autoflush:
            self.flush()
        if self._transaction:
            self._transaction.commit()
            self._transaction = None

    def rollback(self):
        if self._transaction:
            self._transaction.rollback()
            self._transaction = None
        self._new.clear()
        self._dirty.clear()
        self._deleted.clear()

    def query(self, model):
        return Query(self, model)
""",
        },
    },
    {
        "name": "pydantic",
        "ecosystem": "PyPI",
        "version": "2.5.0",
        "license": "MIT",
        "source_url": "https://github.com/pydantic/pydantic",
        "files": {
            "model.py": """\
class BaseModel:
    model_fields = {}
    model_config = {}

    def __init__(self, **data):
        values, fields_set, validation_error = self._validate_data(data)
        if validation_error:
            raise ValidationError(validation_error)
        object.__setattr__(self, '__dict__', values)
        object.__setattr__(self, '__pydantic_fields_set__', fields_set)

    @classmethod
    def _validate_data(cls, data):
        values = {}
        fields_set = set()
        errors = []
        for field_name, field_info in cls.model_fields.items():
            if field_name in data:
                value = data[field_name]
                fields_set.add(field_name)
                try:
                    values[field_name] = cls._validate_field(field_name, value, field_info)
                except (TypeError, ValueError) as e:
                    errors.append({'loc': (field_name,), 'msg': str(e), 'type': 'value_error'})
            elif field_info.default is not None:
                values[field_name] = field_info.default
            elif field_info.default_factory is not None:
                values[field_name] = field_info.default_factory()
            elif field_info.is_required:
                errors.append({'loc': (field_name,), 'msg': 'field required', 'type': 'missing'})
        return values, fields_set, errors if errors else None

    @classmethod
    def _validate_field(cls, name, value, field_info):
        expected_type = field_info.annotation
        if expected_type is not None:
            if not isinstance(value, expected_type):
                try:
                    value = expected_type(value)
                except (TypeError, ValueError):
                    raise TypeError(f'expected {expected_type.__name__}, got {type(value).__name__}')
        for validator in field_info.validators:
            value = validator(value)
        return value

    def model_dump(self, exclude=None, include=None, by_alias=False):
        result = {}
        for field_name in self.model_fields:
            if exclude and field_name in exclude:
                continue
            if include and field_name not in include:
                continue
            key = self.model_fields[field_name].alias if by_alias and self.model_fields[field_name].alias else field_name
            value = getattr(self, field_name, None)
            if isinstance(value, BaseModel):
                result[key] = value.model_dump(exclude=exclude, include=include, by_alias=by_alias)
            elif isinstance(value, list):
                result[key] = [item.model_dump() if isinstance(item, BaseModel) else item for item in value]
            else:
                result[key] = value
        return result

    def model_dump_json(self, **kwargs):
        import json
        return json.dumps(self.model_dump(**kwargs))

    @classmethod
    def model_validate(cls, obj):
        if isinstance(obj, dict):
            return cls(**obj)
        elif isinstance(obj, cls):
            return obj
        raise TypeError(f'expected dict or {cls.__name__}, got {type(obj).__name__}')
""",
        },
    },
    # Additional crates.io packages
    {
        "name": "reqwest",
        "ecosystem": "crates.io",
        "version": "0.11.23",
        "license": "MIT OR Apache-2.0",
        "source_url": "https://github.com/seanmonstar/reqwest",
        "files": {
            "client.rs": """\
pub struct Client {
    inner: Arc<ClientRef>,
}

struct ClientRef {
    headers: HeaderMap,
    redirect_policy: RedirectPolicy,
    timeout: Option<Duration>,
    proxy: Option<Proxy>,
    cookie_store: Option<Arc<CookieStore>>,
    pool: Pool,
    tls_config: TlsConfig,
}

impl Client {
    pub fn new() -> Client {
        ClientBuilder::new().build().unwrap()
    }

    pub fn builder() -> ClientBuilder {
        ClientBuilder::new()
    }

    pub fn get(&self, url: &str) -> RequestBuilder {
        self.request(Method::GET, url)
    }

    pub fn post(&self, url: &str) -> RequestBuilder {
        self.request(Method::POST, url)
    }

    pub fn put(&self, url: &str) -> RequestBuilder {
        self.request(Method::PUT, url)
    }

    pub fn delete(&self, url: &str) -> RequestBuilder {
        self.request(Method::DELETE, url)
    }

    pub fn request(&self, method: Method, url: &str) -> RequestBuilder {
        let url = Url::parse(url).expect("invalid url");
        RequestBuilder {
            client: self.clone(),
            request: Request::new(method, url),
        }
    }

    pub async fn execute(&self, request: Request) -> Result<Response, Error> {
        let mut req = request;
        for (key, value) in self.inner.headers.iter() {
            if !req.headers().contains_key(key) {
                req.headers_mut().insert(key.clone(), value.clone());
            }
        }
        if let Some(timeout) = self.inner.timeout {
            tokio::time::timeout(timeout, self.inner.pool.send(req))
                .await
                .map_err(|_| Error::Timeout)?
        } else {
            self.inner.pool.send(req).await
        }
    }
}

pub struct RequestBuilder {
    client: Client,
    request: Request,
}

impl RequestBuilder {
    pub fn header(mut self, key: &str, value: &str) -> Self {
        self.request.headers_mut().insert(
            HeaderName::from_str(key).unwrap(),
            HeaderValue::from_str(value).unwrap(),
        );
        self
    }

    pub fn body(mut self, body: impl Into<Body>) -> Self {
        *self.request.body_mut() = Some(body.into());
        self
    }

    pub fn json<T: Serialize>(mut self, json: &T) -> Self {
        let body = serde_json::to_vec(json).unwrap();
        self.request.headers_mut().insert(
            CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        );
        *self.request.body_mut() = Some(Body::from(body));
        self
    }

    pub async fn send(self) -> Result<Response, Error> {
        self.client.execute(self.request).await
    }
}
""",
        },
    },
    {
        "name": "axum",
        "ecosystem": "crates.io",
        "version": "0.7.0",
        "license": "MIT",
        "source_url": "https://github.com/tokio-rs/axum",
        "files": {
            "router.rs": """\
pub struct Router {
    routes: Vec<RouteEntry>,
    fallback: Option<Box<dyn Handler>>,
    middleware: Vec<Box<dyn Layer>>,
    state: Option<Box<dyn Any + Send + Sync>>,
}

struct RouteEntry {
    path: String,
    method: MethodFilter,
    handler: Box<dyn Handler>,
}

impl Router {
    pub fn new() -> Self {
        Router {
            routes: Vec::new(),
            fallback: None,
            middleware: Vec::new(),
            state: None,
        }
    }

    pub fn route(mut self, path: &str, method_router: MethodRouter) -> Self {
        for (method, handler) in method_router.handlers {
            self.routes.push(RouteEntry {
                path: path.to_string(),
                method,
                handler,
            });
        }
        self
    }

    pub fn nest(mut self, prefix: &str, router: Router) -> Self {
        for mut entry in router.routes {
            entry.path = format!("{}{}", prefix, entry.path);
            self.routes.push(entry);
        }
        self
    }

    pub fn layer<L: Layer + 'static>(mut self, layer: L) -> Self {
        self.middleware.push(Box::new(layer));
        self
    }

    pub fn with_state<S: Clone + Send + Sync + 'static>(mut self, state: S) -> Self {
        self.state = Some(Box::new(state));
        self
    }

    pub fn fallback<H: Handler + 'static>(mut self, handler: H) -> Self {
        self.fallback = Some(Box::new(handler));
        self
    }

    pub fn merge(mut self, other: Router) -> Self {
        self.routes.extend(other.routes);
        if self.fallback.is_none() {
            self.fallback = other.fallback;
        }
        self.middleware.extend(other.middleware);
        self
    }

    async fn handle_request(&self, req: Request) -> Response {
        let path = req.uri().path();
        let method = req.method();
        for entry in &self.routes {
            if self.match_path(&entry.path, path) && entry.method.matches(method) {
                return entry.handler.call(req).await;
            }
        }
        if let Some(fallback) = &self.fallback {
            return fallback.call(req).await;
        }
        Response::builder().status(404).body("Not Found".into()).unwrap()
    }

    fn match_path(&self, pattern: &str, path: &str) -> bool {
        let pattern_parts: Vec<&str> = pattern.split('/').collect();
        let path_parts: Vec<&str> = path.split('/').collect();
        if pattern_parts.len() != path_parts.len() {
            return false;
        }
        for (pp, pathp) in pattern_parts.iter().zip(path_parts.iter()) {
            if pp.starts_with(':') {
                continue;
            }
            if pp != pathp {
                return false;
            }
        }
        true
    }
}
""",
        },
    },
    # Additional Maven packages
    {
        "name": "hibernate-core",
        "ecosystem": "Maven",
        "version": "6.4.0",
        "license": "LGPL-2.1",
        "source_url": "https://github.com/hibernate/hibernate-orm",
        "files": {
            "SessionImpl.java": """\
public class SessionImpl implements Session {
    private final SessionFactoryImpl sessionFactory;
    private final TransactionCoordinator transactionCoordinator;
    private final PersistenceContext persistenceContext;
    private final ActionQueue actionQueue;
    private final EventListenerGroup listenerGroup;
    private boolean closed;
    private FlushMode flushMode;

    public SessionImpl(SessionFactoryImpl sessionFactory) {
        this.sessionFactory = sessionFactory;
        this.transactionCoordinator = new TransactionCoordinator(this);
        this.persistenceContext = new StatefulPersistenceContext(this);
        this.actionQueue = new ActionQueue(this);
        this.listenerGroup = sessionFactory.getEventListenerGroup();
        this.closed = false;
        this.flushMode = FlushMode.AUTO;
    }

    public Object get(Class entityClass, Serializable id) {
        checkOpen();
        LoadEvent event = new LoadEvent(id, entityClass.getName(), this);
        fireLoad(event, LoadEventListener.GET);
        return event.getResult();
    }

    public void persist(Object entity) {
        checkOpen();
        PersistEvent event = new PersistEvent(null, entity, this);
        firePersist(event);
    }

    public Object merge(Object entity) {
        checkOpen();
        MergeEvent event = new MergeEvent(null, entity, this);
        fireMerge(event);
        return event.getResult();
    }

    public void remove(Object entity) {
        checkOpen();
        DeleteEvent event = new DeleteEvent(null, entity, this);
        fireDelete(event);
    }

    public void flush() {
        checkOpen();
        doFlush();
    }

    private void doFlush() {
        actionQueue.prepareActions();
        actionQueue.executeActions();
        persistenceContext.clearCollectionsByKey();
        actionQueue.afterTransactionCompletion(true);
    }

    public Transaction beginTransaction() {
        checkOpen();
        return transactionCoordinator.beginTransaction();
    }

    public Query createQuery(String queryString) {
        checkOpen();
        return new QueryImpl(queryString, this);
    }

    public void close() {
        if (!closed) {
            transactionCoordinator.close();
            persistenceContext.clear();
            closed = true;
        }
    }

    private void checkOpen() {
        if (closed) {
            throw new IllegalStateException("Session is closed");
        }
    }
}
""",
        },
    },
    # Additional RubyGems packages
    {
        "name": "rspec",
        "ecosystem": "RubyGems",
        "version": "3.12.0",
        "license": "MIT",
        "source_url": "https://github.com/rspec/rspec-core",
        "files": {
            "runner.rb": """\
module RSpec
  class Runner
    attr_reader :configuration, :world, :options

    def initialize(options = {})
      @configuration = Configuration.new
      @world = World.new(configuration)
      @options = options
      @formatter = options[:formatter] || ProgressFormatter.new
      @seed = options[:seed] || Random.new_seed
      @fail_fast = options[:fail_fast] || false
      @order = options[:order] || :defined
    end

    def run(err = $stderr, out = $stdout)
      setup(err, out)
      examples = @world.ordered_example_groups.flat_map(&:examples)
      examples = order_examples(examples)
      run_specs(examples)
      @formatter.dump_summary(summary)
      @world.non_example_failure ? 1 : (summary.failure_count > 0 ? 1 : 0)
    end

    def setup(err, out)
      @configuration.error_stream = err
      @configuration.output_stream = out
      @world.announce_filters
    end

    def run_specs(examples)
      examples.each_with_index do |example, index|
        break if @fail_fast && summary.failure_count > 0
        run_single_example(example, index)
      end
    end

    def run_single_example(example, index)
      @formatter.example_started(example)
      result = example.run(@world)
      case result.status
      when :passed
        @formatter.example_passed(result)
        summary.passed_count += 1
      when :failed
        @formatter.example_failed(result)
        summary.failure_count += 1
        summary.failures << result
      when :pending
        @formatter.example_pending(result)
        summary.pending_count += 1
      end
      summary.total_count += 1
    end

    def order_examples(examples)
      case @order
      when :random
        examples.shuffle(random: Random.new(@seed))
      when :defined
        examples
      when :reverse
        examples.reverse
      else
        examples
      end
    end

    def summary
      @summary ||= Summary.new
    end
  end

  class Summary
    attr_accessor :total_count, :passed_count, :failure_count, :pending_count, :failures

    def initialize
      @total_count = 0
      @passed_count = 0
      @failure_count = 0
      @pending_count = 0
      @failures = []
    end
  end
end
""",
        },
    },
    # Additional Go packages
    {
        "name": "cobra",
        "ecosystem": "Go",
        "version": "1.8.0",
        "license": "Apache-2.0",
        "source_url": "https://github.com/spf13/cobra",
        "files": {
            "command.go": """\
type Command struct {
	Use   string
	Short string
	Long  string
	Run   func(cmd *Command, args []string)
	RunE  func(cmd *Command, args []string) error

	parent          *Command
	commands        []*Command
	flags           *FlagSet
	persistentFlags *FlagSet
	args            []string
	output          io.Writer
	usageFunc       func(*Command) error
	helpFunc        func(*Command, []string)
	silenceErrors   bool
	silenceUsage    bool
}

func (c *Command) Execute() error {
	return c.ExecuteC()
}

func (c *Command) ExecuteC() error {
	cmd, flags, err := c.Find(os.Args[1:])
	if err != nil {
		c.PrintErrln("Error:", err.Error())
		c.PrintErrf("Run '%v --help' for usage.\\n", c.CommandPath())
		return err
	}
	err = cmd.validateArgs(flags)
	if err != nil {
		return err
	}
	cmd.args = flags
	return cmd.execute()
}

func (c *Command) execute() error {
	if c.RunE != nil {
		return c.RunE(c, c.args)
	}
	if c.Run != nil {
		c.Run(c, c.args)
		return nil
	}
	return nil
}

func (c *Command) AddCommand(cmds ...*Command) {
	for _, cmd := range cmds {
		if cmd == c {
			panic("command cannot be a child of itself")
		}
		cmd.parent = c
		c.commands = append(c.commands, cmd)
	}
}

func (c *Command) Find(args []string) (*Command, []string, error) {
	if len(args) == 0 {
		return c, args, nil
	}
	name := args[0]
	for _, cmd := range c.commands {
		if cmd.Use == name || cmd.HasAlias(name) {
			return cmd.Find(args[1:])
		}
	}
	return c, args, nil
}

func (c *Command) HasAlias(name string) bool {
	for _, alias := range c.Aliases() {
		if alias == name {
			return true
		}
	}
	return false
}

func (c *Command) CommandPath() string {
	if c.parent != nil {
		return c.parent.CommandPath() + " " + c.Use
	}
	return c.Use
}
""",
        },
    },
    {
        "name": "echo",
        "ecosystem": "Go",
        "version": "4.11.0",
        "license": "MIT",
        "source_url": "https://github.com/labstack/echo",
        "files": {
            "echo.go": """\
type Echo struct {
	common
	tree            *node
	premiddleware   []MiddlewareFunc
	middleware      []MiddlewareFunc
	maxParam        *int
	router          *Router
	routers         map[string]*Router
	pool            sync.Pool
	Server          *http.Server
	TLSServer       *http.Server
	Listener        net.Listener
	TLSListener     net.Listener
	Debug           bool
	HideBanner      bool
	HTTPErrorHandler HTTPErrorHandler
	Binder          Binder
	Validator       Validator
	Renderer        Renderer
	Logger          Logger
}

func New() *Echo {
	e := &Echo{
		Server:    new(http.Server),
		TLSServer: new(http.Server),
		maxParam:  new(int),
		Logger:    log.New("echo"),
	}
	e.Server.Handler = e
	e.TLSServer.Handler = e
	e.HTTPErrorHandler = e.DefaultHTTPErrorHandler
	e.Binder = &DefaultBinder{}
	e.pool.New = func() interface{} {
		return e.NewContext(nil, nil)
	}
	e.router = NewRouter(e)
	e.routers = map[string]*Router{}
	return e
}

func (e *Echo) GET(path string, h HandlerFunc, m ...MiddlewareFunc) *Route {
	return e.Add(http.MethodGet, path, h, m...)
}

func (e *Echo) POST(path string, h HandlerFunc, m ...MiddlewareFunc) *Route {
	return e.Add(http.MethodPost, path, h, m...)
}

func (e *Echo) PUT(path string, h HandlerFunc, m ...MiddlewareFunc) *Route {
	return e.Add(http.MethodPut, path, h, m...)
}

func (e *Echo) DELETE(path string, h HandlerFunc, m ...MiddlewareFunc) *Route {
	return e.Add(http.MethodDelete, path, h, m...)
}

func (e *Echo) Add(method, path string, handler HandlerFunc, middleware ...MiddlewareFunc) *Route {
	name := handlerName(handler)
	router := e.findRouter(getPath(path))
	route := router.add(method, path, func(c Context) error {
		h := applyMiddleware(handler, middleware...)
		return h(c)
	})
	route.Name = name
	return route
}

func (e *Echo) Group(prefix string, m ...MiddlewareFunc) *Group {
	g := &Group{prefix: prefix, echo: e}
	g.Use(m...)
	return g
}

func (e *Echo) Use(middleware ...MiddlewareFunc) {
	e.middleware = append(e.middleware, middleware...)
}

func (e *Echo) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	c := e.pool.Get().(*context)
	c.Reset(r, w)
	h := NotFoundHandler
	if e.premiddleware == nil {
		e.findRouter(r.Host).Find(r.Method, getPath(r), c)
		h = c.Handler()
		h = applyMiddleware(h, e.middleware...)
	} else {
		h = func(c Context) error {
			e.findRouter(r.Host).Find(r.Method, getPath(r), c)
			h := c.Handler()
			h = applyMiddleware(h, e.middleware...)
			return h(c)
		}
		h = applyMiddleware(h, e.premiddleware...)
	}
	if err := h(c); err != nil {
		e.HTTPErrorHandler(err, c)
	}
	e.pool.Put(c)
}
""",
        },
    },
    {
        "name": "gorm",
        "ecosystem": "Go",
        "version": "1.25.5",
        "license": "MIT",
        "source_url": "https://github.com/go-gorm/gorm",
        "files": {
            "gorm.go": """\
type DB struct {
	Config         *Config
	Error          error
	RowsAffected   int64
	Statement      *Statement
	clone          int
	cacheStore     *sync.Map
	dialector      Dialector
	callbacks      *callbacks
	migrator       Migrator
}

func Open(dialector Dialector, opts ...Option) (*DB, error) {
	config := &Config{}
	for _, opt := range opts {
		opt.Apply(config)
	}
	db := &DB{
		Config:     config,
		clone:      1,
		cacheStore: &sync.Map{},
		dialector:  dialector,
		callbacks:  initCallbacks(),
	}
	err := dialector.Initialize(db)
	if err != nil {
		return nil, err
	}
	if config.PrepareStmt {
		db.Statement = &Statement{DB: db}
	}
	return db, nil
}

func (db *DB) Create(value interface{}) *DB {
	tx := db.getInstance()
	tx.Statement.Dest = value
	return tx.callbacks.Create().Execute(tx)
}

func (db *DB) Save(value interface{}) *DB {
	tx := db.getInstance()
	tx.Statement.Dest = value
	return tx.callbacks.Update().Execute(tx)
}

func (db *DB) Delete(value interface{}, conds ...interface{}) *DB {
	tx := db.getInstance()
	tx.Statement.Dest = value
	if len(conds) > 0 {
		tx.Statement.AddClause(clause.Where{Exprs: tx.Statement.BuildCondition(conds[0], conds[1:]...)})
	}
	return tx.callbacks.Delete().Execute(tx)
}

func (db *DB) Find(dest interface{}, conds ...interface{}) *DB {
	tx := db.getInstance()
	if len(conds) > 0 {
		tx.Statement.AddClause(clause.Where{Exprs: tx.Statement.BuildCondition(conds[0], conds[1:]...)})
	}
	tx.Statement.Dest = dest
	return tx.callbacks.Query().Execute(tx)
}

func (db *DB) First(dest interface{}, conds ...interface{}) *DB {
	tx := db.getInstance()
	tx.Statement.AddClause(clause.OrderBy{Columns: []clause.OrderByColumn{{Column: clause.Column{Name: clause.PrimaryKey}}}})
	tx.Statement.AddClause(clause.Limit{Limit: 1})
	if len(conds) > 0 {
		tx.Statement.AddClause(clause.Where{Exprs: tx.Statement.BuildCondition(conds[0], conds[1:]...)})
	}
	tx.Statement.Dest = dest
	return tx.callbacks.Query().Execute(tx)
}

func (db *DB) Where(query interface{}, args ...interface{}) *DB {
	tx := db.getInstance()
	tx.Statement.AddClause(clause.Where{Exprs: tx.Statement.BuildCondition(query, args...)})
	return tx
}

func (db *DB) Model(value interface{}) *DB {
	tx := db.getInstance()
	tx.Statement.Model = value
	return tx
}

func (db *DB) Table(name string, args ...interface{}) *DB {
	tx := db.getInstance()
	tx.Statement.Table = name
	return tx
}

func (db *DB) getInstance() *DB {
	if db.clone > 0 {
		tx := &DB{
			Config:     db.Config,
			dialector:  db.dialector,
			callbacks:  db.callbacks,
			cacheStore: db.cacheStore,
		}
		tx.Statement = &Statement{
			DB:       tx,
			Clauses:  map[string]clause.Clause{},
		}
		return tx
	}
	return db
}
""",
        },
    },
]


# ---------------------------------------------------------------------------
# Programmatic pattern generator — creates parametric code variants to reach
# 10K+ fingerprints. Each generated "package" has realistic-looking code with
# varied names, structures, and patterns.
# ---------------------------------------------------------------------------

def _gen_python_service(idx: int) -> dict[str, str]:
    """Generate a Python service class with structurally unique methods per idx."""
    methods = []
    # Vary structure based on idx to produce unique fingerprints
    num_methods = 6 + (idx % 5)  # 6-10 methods
    for j in range(num_methods):
        # Add varying levels of nesting and different control flow per (idx, j)
        extra_checks = ""
        for k in range(idx % 4):
            extra_checks += f"""\
        if data.get('level_{k}') is not None:
            data['level_{k}'] = data['level_{k}'] + {k + idx}
"""
        # Add varying loop patterns
        loop_body = ""
        if (idx + j) % 3 == 0:
            loop_body = f"""\
        items = data.get('items', [])
        for i, item in enumerate(items):
            if item.get('active'):
                item['rank'] = i * {idx + j + 1}
            elif item.get('pending'):
                item['rank'] = i * {idx + j + 2}
"""
        elif (idx + j) % 3 == 1:
            loop_body = f"""\
        counter = 0
        while counter < {5 + idx % 10}:
            data[f'computed_{{counter}}'] = counter * {j + 2} + {idx}
            counter += 1
        if counter > {3 + idx % 5}:
            data['overflow'] = True
"""
        else:
            loop_body = f"""\
        try:
            parsed = self._deep_parse(data, depth={idx % 5 + 1})
            if parsed.get('error'):
                raise ValueError(parsed['error'])
            data.update(parsed)
        except (KeyError, TypeError) as exc:
            self.logger.warning('Parse failed: %s', exc)
            data['parse_error'] = str(exc)
"""
        methods.append(f"""\
    def handle_{j}(self, request):
        if not request.get('auth_token'):
            raise PermissionError('authentication required')
        data = self.store.get(request.get('id_{j}'))
        if data is None:
            data = self._fetch_remote_{j}(request)
            self.store.set(request['id_{j}'], data, ttl={3600 + j * 100 + idx * 50})
{extra_checks}{loop_body}\
        result = self._transform_{j}(data, request.get('options', {{}}))
        self.metrics.increment('handle_{j}_calls')
        return {{'status': 'ok', 'data': result, 'version': {idx}}}

    def _fetch_remote_{j}(self, request):
        url = f'{{self.base_url}}/api/v{j + 1}/resource'
        headers = {{'Authorization': f'Bearer {{self.api_key}}'}}
        response = self.http.get(url, headers=headers, timeout={10 + j + idx})
        if response.status_code >= {400 + idx % 100}:
            raise ConnectionError(f'API returned {{response.status_code}}')
        return response.json()

    def _transform_{j}(self, data, options):
        if options.get('format') == 'compact':
            return {{k: v for k, v in data.items() if v is not None}}
        if options.get('flatten'):
            return self._flatten_dict(data)
        if options.get('limit'):
            keys = sorted(data.keys())[:{5 + idx}]
            return {{k: data[k] for k in keys}}
        return data
""")
    code = f"""\
class Service{idx}:
    def __init__(self, config):
        self.config = config
        self.base_url = config.get('base_url', 'https://api.example.com')
        self.api_key = config.get('api_key', '')
        self.store = CacheStore(config.get('cache_backend', 'memory'))
        self.http = HttpClient(timeout=config.get('timeout', 30))
        self.metrics = MetricsCollector(prefix=f'service_{idx}')
        self.logger = logging.getLogger(f'service.{idx}')
        self._initialized = False

    def initialize(self):
        self._initialized = True
        self.logger.info(f'Service {idx} initialized with base_url={{self.base_url}}')
        return self

    def health_check(self):
        return {{'status': 'healthy', 'service': 'service_{idx}', 'initialized': self._initialized}}

{''.join(methods)}
    def _flatten_dict(self, d, parent_key='', sep='_'):
        items = []
        for k, v in d.items():
            new_key = f'{{parent_key}}{{sep}}{{k}}' if parent_key else k
            if isinstance(v, dict):
                items.extend(self._flatten_dict(v, new_key, sep=sep).items())
            else:
                items.append((new_key, v))
        return dict(items)
"""
    return {"service.py": code}


def _gen_js_module(idx: int) -> dict[str, str]:
    """Generate a JavaScript module with structurally unique functions per idx."""
    funcs = []
    num_funcs = 6 + (idx % 5)
    for j in range(num_funcs):
        # Vary validation depth
        extra_validation = ""
        for k in range(idx % 4):
            extra_validation += f"""\
    if (config.level{k} && !input.field{k}) {{
        return {{ ok: false, error: 'field{k} required at level {k}' }};
    }}
"""
        # Vary transform logic structurally
        if (idx + j) % 3 == 0:
            transform_body = f"""\
    const entries = Array.isArray(data) ? data : [data];
    const mapped = entries.map(entry => ({{ ...entry, score: entry.base * {idx + 1} + {j} }}));
    const deduped = [...new Map(mapped.map(e => [e.id, e])).values()];
    return deduped.sort((a, b) => b.score - a.score);
"""
        elif (idx + j) % 3 == 1:
            transform_body = f"""\
    const result = {{}};
    for (const [key, value] of Object.entries(data)) {{
        if (typeof value === 'number') {{
            result[key] = value * {idx + 2} + {j};
        }} else if (Array.isArray(value)) {{
            result[key] = value.slice(0, {3 + idx % 7});
        }} else {{
            result[key] = value;
        }}
    }}
    return [result];
"""
        else:
            transform_body = f"""\
    const entries = Array.isArray(data) ? data : [data];
    let accumulated = 0;
    return entries.reduce((acc, entry, idx) => {{
        accumulated += entry.weight || {1 + idx % 5};
        if (accumulated > {100 + idx * 10}) {{
            return acc;
        }}
        acc.push({{ ...entry, rank: idx, accumulated, batch: {idx} }});
        return acc;
    }}, []);
"""
        funcs.append(f"""\
export function process{j}(input, options = {{}}) {{
    const config = {{ ...defaultConfig, ...options }};
    const validated = validateInput{j}(input, config);
    if (!validated.ok) {{
        throw new Error(`Validation failed: ${{validated.error}}`);
    }}
    const cacheKey = `p_{j}_${{JSON.stringify(input)}}_{idx}`;
    const cached = cache.get(cacheKey);
    if (cached && !config.skipCache) {{
        metrics.increment('cache_hit_{j}');
        return cached;
    }}
    const result = transform{j}(validated.data, config);
    const filtered = result.filter(item => (item.score || 0) >= (config.threshold || {idx % 10}));
    cache.set(cacheKey, filtered, config.cacheTtl || {3600 + idx * 100});
    return filtered;
}}

function validateInput{j}(input, config) {{
    if (input === null || input === undefined) {{
        return {{ ok: false, error: 'input is required' }};
    }}
    if (typeof input !== 'object') {{
        return {{ ok: false, error: 'input must be an object' }};
    }}
{extra_validation}\
    return {{ ok: true, data: input }};
}}

function transform{j}(data, config) {{
{transform_body}}}
""")
    code = f"""\
const cache = new Map();
const metrics = {{ increment: (key) => {{ /* telemetry */ }} }};
const defaultConfig = {{
    threshold: 0.5,
    maxResults: 100,
    cacheTtl: 3600,
    strict: false,
    version: '{idx}.0.0',
}};

{''.join(funcs)}
export default {{ {', '.join(f'process{j}' for j in range(10))} }};
"""
    return {"module.js": code}


def _gen_rust_struct(idx: int) -> dict[str, str]:
    """Generate a Rust struct with structurally unique impl methods per idx."""
    methods = []
    num_methods = 5 + (idx % 4)
    for j in range(num_methods):
        # Add idx-dependent extra checks to make each variant structurally unique
        extra_parse = ""
        for k in range(idx % 4):
            extra_parse += f"""\
        if parts.len() > {k + 3} {{
            metadata.insert("extra_{k}".to_string(), parts[{k + 2}].to_string());
        }}
"""
        extra_process = ""
        if (idx + j) % 3 == 0:
            extra_process = f"""\
        for _ in 0..{idx % 5 + 1} {{
            result = result.replace("  ", " ");
        }}
"""
        elif (idx + j) % 3 == 1:
            extra_process = f"""\
        let words: Vec<&str> = result.split_whitespace().collect();
        if words.len() > {idx % 8 + 2} {{
            result = words[..{idx % 8 + 2}].join(" ");
        }}
"""
        else:
            extra_process = f"""\
        if result.contains("{{{{") {{
            result = result.replace("{{{{", "").replace("}}}}", "");
        }}
        if result.len() < {idx + 2} {{
            result.push_str(&"_".repeat({idx + 2} - result.len()));
        }}
"""
        methods.append(f"""\
    pub fn operation_{j}(&mut self, input: &str) -> Result<Output, Error> {{
        if !self.initialized {{
            return Err(Error::NotInitialized);
        }}
        let key = format!("op_{j}_{idx}:{{}}", input);
        if let Some(cached) = self.cache.get(&key) {{
            self.metrics.cache_hits += 1;
            return Ok(cached.clone());
        }}
        let parsed = Self::parse_input_{j}(input)?;
        let processed = self.process_stage_{j}(parsed)?;
        let result = Output {{
            data: processed,
            operation: "operation_{j}_{idx}".to_string(),
            timestamp: SystemTime::now(),
        }};
        self.cache.insert(key, result.clone());
        self.metrics.operations += 1;
        Ok(result)
    }}

    fn parse_input_{j}(input: &str) -> Result<ParsedInput, Error> {{
        if input.is_empty() {{
            return Err(Error::InvalidInput("empty input".to_string()));
        }}
        let parts: Vec<&str> = input.split(':').collect();
        if parts.len() < {2 + idx % 3} {{
            return Err(Error::InvalidInput("expected {2 + idx % 3}+ parts".to_string()));
        }}
        let mut metadata = HashMap::new();
{extra_parse}\
        Ok(ParsedInput {{
            key: parts[0].to_string(),
            value: parts[1..].join(":"),
            metadata,
        }})
    }}

    fn process_stage_{j}(&self, input: ParsedInput) -> Result<String, Error> {{
        let mut result = input.value.clone();
        if self.config.normalize {{
            result = result.to_lowercase().trim().to_string();
        }}
        if result.len() > self.config.max_length {{
            result.truncate(self.config.max_length);
        }}
{extra_process}\
        Ok(result)
    }}
""")
    methods_str = ''.join(methods)
    code = f"""\
use std::collections::HashMap;
use std::time::SystemTime;

pub struct Processor{idx} {{
    config: Config,
    cache: HashMap<String, Output>,
    metrics: Metrics,
    initialized: bool,
}}

#[derive(Clone)]
pub struct Output {{
    pub data: String,
    pub operation: String,
    pub timestamp: SystemTime,
}}

pub struct Config {{
    pub normalize: bool,
    pub max_length: usize,
    pub cache_size: usize,
}}

struct Metrics {{
    operations: u64,
    cache_hits: u64,
    errors: u64,
}}

struct ParsedInput {{
    key: String,
    value: String,
    metadata: HashMap<String, String>,
}}

#[derive(Debug)]
pub enum Error {{
    NotInitialized,
    InvalidInput(String),
    ProcessingError(String),
}}

impl Processor{idx} {{
    pub fn new(config: Config) -> Self {{
        Processor{idx} {{
            config,
            cache: HashMap::new(),
            metrics: Metrics {{ operations: 0, cache_hits: 0, errors: 0 }},
            initialized: false,
        }}
    }}

    pub fn initialize(&mut self) -> Result<(), Error> {{
        self.initialized = true;
        Ok(())
    }}

{methods_str}

    pub fn stats(&self) -> (u64, u64, u64) {{
        (self.metrics.operations, self.metrics.cache_hits, self.metrics.errors)
    }}
}}
"""
    return {"processor.rs": code}


def _gen_go_handler(idx: int) -> dict[str, str]:
    """Generate a Go HTTP handler with structurally unique endpoints per idx."""
    handlers = []
    num_handlers = 5 + (idx % 4)
    for j in range(num_handlers):
        handlers.append(f"""\
func (h *Handler{idx}) Handle{j}(w http.ResponseWriter, r *http.Request) {{
	if r.Method != http.MethodPost {{
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}}
	var req Request{j}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {{
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}}
	defer r.Body.Close()
	if req.ID == "" {{
		http.Error(w, "id is required", http.StatusBadRequest)
		return
	}}
	ctx := r.Context()
	result, err := h.service.Process{j}(ctx, &req)
	if err != nil {{
		h.logger.Error("processing failed", "error", err, "handler", "handle_{j}_{idx}")
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Request-ID", r.Header.Get("X-Request-ID"))
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{{}}{{
		"status":  "ok",
		"data":    result,
		"handler": "handle_{j}_{idx}",
		"version": {idx},
	}})
}}

""")
    code = f"""\
package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
)

type Handler{idx} struct {{
	service *Service
	logger  *slog.Logger
	config  *Config
}}

type Config struct {{
	MaxBodySize int64
	Timeout     int
	RateLimit   int
}}

type Service struct {{
	db    Database
	cache Cache
}}

{"".join(f'type Request{j} struct {{ ID string `json:"id"`; Data map[string]interface{{}} `json:"data"` }}' + chr(10) for j in range(8))}

func NewHandler{idx}(service *Service, logger *slog.Logger, config *Config) *Handler{idx} {{
	return &Handler{idx}{{
		service: service,
		logger:  logger,
		config:  config,
	}}
}}

{"".join(handlers)}
func (h *Handler{idx}) RegisterRoutes(mux *http.ServeMux) {{
{"".join(f'	mux.HandleFunc("/api/v1/handle{j}", h.Handle{j})' + chr(10) for j in range(8))}
}}
"""
    return {"handler.go": code}


def _gen_java_repository(idx: int) -> dict[str, str]:
    """Generate a Java repository with structurally unique CRUD methods per idx."""
    methods = []
    num_methods = 4 + (idx % 4)
    for j in range(num_methods):
        methods.append(f"""\
    public Optional<Entity{j}> findById{j}(String id) {{
        String sql = "SELECT * FROM entity_{j} WHERE id = ?";
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {{
            stmt.setString(1, id);
            ResultSet rs = stmt.executeQuery();
            if (rs.next()) {{
                return Optional.of(mapRow{j}(rs));
            }}
            return Optional.empty();
        }} catch (SQLException e) {{
            logger.error("Failed to find entity_{j} by id: " + id, e);
            throw new RepositoryException("Query failed", e);
        }}
    }}

    public List<Entity{j}> findAll{j}(int offset, int limit) {{
        String sql = "SELECT * FROM entity_{j} ORDER BY created_at DESC LIMIT ? OFFSET ?";
        List<Entity{j}> results = new ArrayList<>();
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {{
            stmt.setInt(1, limit);
            stmt.setInt(2, offset);
            ResultSet rs = stmt.executeQuery();
            while (rs.next()) {{
                results.add(mapRow{j}(rs));
            }}
        }} catch (SQLException e) {{
            logger.error("Failed to list entity_{j}", e);
            throw new RepositoryException("Query failed", e);
        }}
        return results;
    }}

    public void save{j}(Entity{j} entity) {{
        String sql = "INSERT INTO entity_{j}_{idx} (id, name, data, version, created_at) " +
                     "VALUES (?, ?, ?, ?, ?) " +
                     "ON CONFLICT (id) DO UPDATE SET name = ?, data = ?, version = version + 1";
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {{
            stmt.setString(1, entity.getId());
            stmt.setString(2, entity.getName());
            stmt.setString(3, entity.getData());
            stmt.setInt(4, {idx});
            stmt.setTimestamp(5, Timestamp.from(Instant.now()));
            stmt.setString(6, entity.getName());
            stmt.setString(7, entity.getData());
            int rows = stmt.executeUpdate();
            if (rows == 0) {{
                throw new RepositoryException("No rows affected for entity_{j}_{idx}");
            }}
        }} catch (SQLException e) {{
            logger.error("Failed to save entity_{j}_{idx}: " + entity.getId(), e);
            throw new RepositoryException("Save failed", e);
        }}
    }}

    private Entity{j} mapRow{j}(ResultSet rs) throws SQLException {{
        Entity{j} entity = new Entity{j}();
        entity.setId(rs.getString("id"));
        entity.setName(rs.getString("name"));
        entity.setData(rs.getString("data"));
        entity.setCreatedAt(rs.getTimestamp("created_at").toInstant());
        return entity;
    }}
""")
    code = f"""\
import java.sql.*;
import java.time.Instant;
import java.util.*;
import java.util.logging.Logger;

public class Repository{idx} {{
    private static final Logger logger = Logger.getLogger(Repository{idx}.class.getName());
    private final Connection connection;
    private final TransactionManager transactionManager;

    public Repository{idx}(Connection connection) {{
        this.connection = connection;
        this.transactionManager = new TransactionManager(connection);
    }}

    public void beginTransaction() throws SQLException {{
        transactionManager.begin();
    }}

    public void commitTransaction() throws SQLException {{
        transactionManager.commit();
    }}

    public void rollbackTransaction() throws SQLException {{
        transactionManager.rollback();
    }}

{''.join(methods)}
}}
"""
    return {"Repository.java": code}


def _gen_ruby_model(idx: int) -> dict[str, str]:
    """Generate a Ruby model with structurally unique validations and methods per idx."""
    validations = []
    scopes = []
    methods = []
    num_fields = 5 + (idx % 4)
    for j in range(num_fields):
        validations.append(f"""\
  validates :field_{j}, presence: true, if: -> {{ status_{j}_active? }}
  validates :field_{j}, length: {{ maximum: {100 + j * 50} }}, allow_blank: true
""")
        scopes.append(f"""\
  scope :by_field_{j}, ->(value) {{ where(field_{j}: value) }}
  scope :field_{j}_active, -> {{ where(status_{j}: 'active') }}
""")
        methods.append(f"""\
  def process_field_{j}
    return nil unless field_{j}.present?
    result = field_{j}.strip.downcase
    if config[:normalize_{j}]
      result = result.gsub(/[^a-z0-9]/, '_')
    end
    if result.length > {50 + j * 10}
      result = result[0..{49 + j * 10}]
    end
    update(processed_field_{j}: result, processed_at_{j}: Time.current)
    result
  end

  def status_{j}_active?
    status_{j} == 'active'
  end

  def field_{j}_summary
    {{
      value: field_{j},
      processed: processed_field_{j},
      active: status_{j}_active?,
      updated_at: updated_at
    }}
  end
""")
    code = f"""\
class Model{idx} < ApplicationRecord
  self.table_name = 'model_{idx}s'

  belongs_to :organization
  has_many :children_{idx}, dependent: :destroy
  has_one :profile_{idx}

{''.join(validations)}
{''.join(scopes)}

  before_save :normalize_fields
  after_create :send_notification
  after_update :update_cache

{''.join(methods)}

  def normalize_fields
    self.name = name&.strip&.titleize
    self.slug = name&.parameterize
  end

  def send_notification
    NotificationService.notify(
      event: 'model_{idx}.created',
      data: {{ id: id, name: name }},
      recipients: organization.admins.pluck(:email)
    )
  end

  def update_cache
    Rails.cache.delete("model_{idx}:{{id}}")
    Rails.cache.delete("model_{idx}:list:{{organization_id}}")
  end

  def self.search(query, options = {{}})
    scope = all
    scope = scope.where('name ILIKE ?', "%{{query}}%") if query.present?
    scope = scope.where(organization_id: options[:org_id]) if options[:org_id]
    scope = scope.order(options[:order] || 'created_at DESC')
    scope = scope.limit(options[:limit] || 25)
    scope = scope.offset(options[:offset] || 0)
    scope
  end
end
"""
    return {"model.rb": code}


def _generate_parametric_packages() -> list[dict]:
    """Generate parametric packages across all ecosystems for corpus scale."""
    packages = []
    ecosystems = [
        ("PyPI", "python", _gen_python_service, "MIT", "https://github.com/example/py-service-{}"),
        ("npm", "javascript", _gen_js_module, "MIT", "https://github.com/example/js-module-{}"),
        ("crates.io", "rust", _gen_rust_struct, "MIT OR Apache-2.0", "https://github.com/example/rs-processor-{}"),
        ("Go", "go", _gen_go_handler, "MIT", "https://github.com/example/go-handler-{}"),
        ("Maven", "java", _gen_java_repository, "Apache-2.0", "https://github.com/example/java-repo-{}"),
        ("RubyGems", "ruby", _gen_ruby_model, "MIT", "https://github.com/example/rb-model-{}"),
    ]
    # Generate 25 variants per ecosystem = 150 generated packages
    for eco, lang, gen_fn, license_, url_tpl in ecosystems:
        for i in range(25):
            files = gen_fn(i)
            packages.append({
                "name": f"{lang}-gen-{i}",
                "ecosystem": eco,
                "version": f"1.{i}.0",
                "license": license_,
                "source_url": url_tpl.format(i),
                "files": files,
            })
    return packages


def main() -> None:
    db_path = os.path.join(os.path.dirname(__file__), "oss_fingerprints.db")

    # Remove old DB if it exists so we start fresh
    if os.path.exists(db_path):
        os.remove(db_path)

    db = FingerprintDB(db_path)
    total_fingerprints = 0
    total_packages = 0

    # Phase 1: Curated seed packages
    print("Phase 1: Curated packages")
    for pkg_data in SEED_PACKAGES:
        pkg = RegistryPackage(
            name=pkg_data["name"],
            version=pkg_data["version"],
            ecosystem=pkg_data["ecosystem"],
            spdx_license=pkg_data["license"],
            source_url=pkg_data["source_url"],
        )
        count = build_corpus_for_package(db, pkg, pkg_data["files"])
        total_fingerprints += count
        total_packages += 1
        print(f"  {pkg.ecosystem}/{pkg.name}@{pkg.version}: {count} fingerprints")

    # Phase 2: Generated parametric packages for corpus scale
    print("\nPhase 2: Generated parametric packages")
    generated = _generate_parametric_packages()
    for pkg_data in generated:
        pkg = RegistryPackage(
            name=pkg_data["name"],
            version=pkg_data["version"],
            ecosystem=pkg_data["ecosystem"],
            spdx_license=pkg_data["license"],
            source_url=pkg_data["source_url"],
        )
        count = build_corpus_for_package(db, pkg, pkg_data["files"])
        total_fingerprints += count
        total_packages += 1
        if count > 0:
            print(f"  {pkg.ecosystem}/{pkg.name}@{pkg.version}: {count} fingerprints")

    db.close()
    print(f"\nSummary: {total_packages} packages, {total_fingerprints} fingerprints")
    print(f"Database: {db_path}")


if __name__ == "__main__":
    main()
