load("@aspect_rules_js//js:providers.bzl", "JsInfo", "js_info")
load("@aspect_rules_ts//ts:defs.bzl", _ts_project = "ts_project")
load("@build_bazel_rules_nodejs//:providers.bzl", "DeclarationInfo", "JSEcmaScriptModuleInfo", "JSModuleInfo", "LinkablePackageInfo")
load("@devinfra//bazel/ts_project:index.bzl", "strict_deps_test")

def _ts_deps_interop_impl(ctx):
    types = []
    sources = []
    runfiles = ctx.runfiles(files = [])
    for dep in ctx.attr.deps:
        if not DeclarationInfo in dep:
            fail("Expected target with DeclarationInfo: %s", dep)
        types.append(dep[DeclarationInfo].transitive_declarations)
        if not JSModuleInfo in dep:
            fail("Expected target with JSModuleInfo: %s", dep)
        sources.append(dep[JSModuleInfo].sources)
        if not DefaultInfo in dep:
            fail("Expected target with DefaultInfo: %s", dep)
        runfiles = runfiles.merge(dep[DefaultInfo].default_runfiles)

    return [
        DefaultInfo(runfiles = runfiles),
        ## NOTE: We don't need to propagate module mappings FORTUNATELY!
        # because rules_nodejs supports tsconfig path mapping, given that
        # everything is nicely compiled from `bazel-bin/`!
        js_info(
            target = ctx.label,
            transitive_types = depset(transitive = types),
            transitive_sources = depset(transitive = sources),
        ),
    ]

ts_deps_interop = rule(
    implementation = _ts_deps_interop_impl,
    attrs = {
        "deps": attr.label_list(providers = [DeclarationInfo], mandatory = True),
    },
    toolchains = ["@devinfra//bazel/git-toolchain:toolchain_type"],
)

def _ts_project_module_impl(ctx):
    # Forward runfiles. e.g. JSON files on `ts_project#data`. The jasmine
    # consuming rules may rely on this, or the linker due to its symlinks then.
    runfiles = ctx.attr.dep[DefaultInfo].default_runfiles
    info = ctx.attr.dep[JsInfo]

    # Filter runfiles to not include `node_modules` from Aspect as this interop
    # target is supposed to be used downstream by `rules_nodejs` consumers,
    # and mixing pnpm-style node modules with linker node modules is incompatible.
    filtered_runfiles = []
    for f in runfiles.files.to_list():
        if f.short_path.startswith("node_modules/"):
            continue
        filtered_runfiles.append(f)
    runfiles = ctx.runfiles(files = filtered_runfiles)

    providers = [
        DefaultInfo(
            runfiles = runfiles,
        ),
        JSModuleInfo(
            direct_sources = info.sources,
            sources = depset(transitive = [info.transitive_sources]),
        ),
        JSEcmaScriptModuleInfo(
            direct_sources = info.sources,
            sources = depset(transitive = [info.transitive_sources]),
        ),
        DeclarationInfo(
            declarations = _filter_types_depset(info.types),
            transitive_declarations = _filter_types_depset(info.transitive_types),
            type_blocklisted_declarations = depset(),
        ),
    ]

    if ctx.attr.module_name:
        providers.append(
            LinkablePackageInfo(
                package_name = ctx.attr.module_name,
                package_path = "",
                path = "%s/%s/%s" % (ctx.bin_dir.path, ctx.label.workspace_root, ctx.label.package),
                files = info.sources,
            ),
        )

    return providers

ts_project_module = rule(
    implementation = _ts_project_module_impl,
    attrs = {
        "dep": attr.label(providers = [JsInfo], mandatory = True),
        # Noop attribute for aspect propagation of the linker interop deps; so
        # that transitive linker dependencies are discovered.
        "deps": attr.label_list(),
        # Note: The module aspect from consuming `ts_library` targets will
        # consume the module mappings automatically.
        "module_name": attr.string(),
        "module_root": attr.string(),
    },
)

def ts_project(
        name,
        module_name = None,
        deps = [],
        tsconfig = None,
        testonly = False,
        visibility = None,
        ignore_strict_deps = False,
        **kwargs):
    if tsconfig == None:
        tsconfig = "//:test-tsconfig" if testonly else "//:build-tsconfig"

    _ts_project(
        name = name,
        testonly = testonly,
        declaration = True,
        tsconfig = tsconfig,
        visibility = visibility,
        # Use the worker from our own Angular rules, as the default worker
        # from `rules_ts` is incompatible with TS5+ and abandoned. We need
        # worker for efficient, fast DX and avoiding Windows no-sandbox issues.
        supports_workers = 1,
        tsc_worker = "//tools:vanilla_ts_worker",
        deps = deps,
        **kwargs
    )

    if not ignore_strict_deps:
        strict_deps_test(
            name = "%s_strict_deps_test" % name,
            srcs = kwargs.get("srcs", []),
            deps = deps,
        )

    ts_project_module(
        name = "%s_legacy" % name,
        testonly = testonly,
        visibility = visibility,
        dep = name,
        deps = deps,
        module_name = module_name,
    )

# Filter type provider to not include `.json` files. `ts_config`
# targets are included in `ts_project` and their tsconfig json file
# is included as type. See:
# https://github.com/aspect-build/rules_ts/blob/main/ts/private/ts_config.bzl#L55C63-L55C68.
def _filter_types_depset(types_depset):
    types = []

    for t in types_depset.to_list():
        if t.short_path.endswith(".json"):
            continue
        types.append(t)

    return depset(types)
