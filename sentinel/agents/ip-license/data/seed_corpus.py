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
# Seed packages: 20+ across npm, PyPI, crates.io, Maven, RubyGems, Go
# Code snippets are representative algorithmic patterns, NOT exact copies.
# Each snippet must be >= 12 lines so the 10-line sliding window produces
# at least 1 fingerprint.
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
]


def main() -> None:
    db_path = os.path.join(os.path.dirname(__file__), "oss_fingerprints.db")

    # Remove old DB if it exists so we start fresh
    if os.path.exists(db_path):
        os.remove(db_path)

    db = FingerprintDB(db_path)
    total_fingerprints = 0

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
        print(f"  {pkg.ecosystem}/{pkg.name}@{pkg.version}: {count} fingerprints")

    db.close()
    print(f"\nSummary: {len(SEED_PACKAGES)} packages, {total_fingerprints} fingerprints")
    print(f"Database: {db_path}")


if __name__ == "__main__":
    main()
