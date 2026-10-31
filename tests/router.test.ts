import { describe, expect, it } from 'vitest';
import { createScreenRouter, memoryRouter, type RouterEvent } from 'multi-screen';

describe('ScreenRouter', () => {
  it('resolves any screen through the generic route', () => {
    const router = createScreenRouter({ adapter: memoryRouter('/screens/lobby') });
    expect(router.current?.screenId).toBe('lobby');
    expect(router.pathFor('a b')).toBe('/screens/a%20b');
  });

  it('adds and removes routes at runtime, and re-matches the current URL', () => {
    const router = createScreenRouter({ adapter: memoryRouter('/hall/north') });
    const events: RouterEvent['type'][] = [];
    router.subscribe((e) => events.push(e.type));
    expect(router.current).toBeUndefined();
    const remove = router.addRoute({ path: '/hall/:zone', resolve: (p) => `hall-${p.zone}` });
    expect(router.current?.screenId).toBe('hall-north');
    expect(router.current?.params).toEqual({ zone: 'north' });
    remove();
    expect(router.current).toBeUndefined();
    expect(events).toEqual(['routes', 'navigate', 'routes', 'navigate']);
  });

  it('prefers static, then less dynamic, then priority', () => {
    const router = createScreenRouter();
    router.addRoute({ path: '/:any', screenId: 'dynamic' });
    router.addRoute({ path: '/fixed', screenId: 'static' });
    expect(router.match('/fixed')?.screenId).toBe('static');
    expect(router.match('/other')?.screenId).toBe('dynamic');
    router.addRoute({ path: '/*rest', screenId: 'catch-all', priority: 10 });
    expect(router.match('/fixed')?.screenId).toBe('catch-all');
  });

  it('replaces a route with the same id', () => {
    const router = createScreenRouter();
    router.addRoute({ id: 'main', path: '/main', screenId: 'a' });
    router.addRoute({ id: 'main', path: '/main', screenId: 'b' });
    expect(router.routes().filter((r) => r.id === 'main')).toHaveLength(1);
    expect(router.match('/main')?.screenId).toBe('b');
  });

  it('navigates to screens and builds hrefs with params', () => {
    const router = createScreenRouter({ basePath: '/app' });
    router.addRoute({ path: '/wall/:index', screenId: 'wall' });
    router.navigateToScreen('wall', { index: '3' });
    expect(router.adapter.location.pathname).toBe('/app/wall/3');
    expect(router.current?.screenId).toBe('wall');
    expect(router.hrefFor('wall', { index: '1' })).toBe('/app/wall/1');
    expect(router.match('/elsewhere')).toBeUndefined();
  });

  it('can disable the generic route', () => {
    const router = createScreenRouter({ screenRoutePrefix: false });
    expect(router.match('/screens/a')).toBeUndefined();
    expect(router.pathFor('a')).toBeUndefined();
  });

  it('loads a batch of routes and replaces them all', () => {
    const router = createScreenRouter();
    router.setRoutes([{ path: '/a', screenId: 'a' }, { path: '/b', screenId: 'b' }]);
    router.setRoutes([{ path: '/c', screenId: 'c' }], { replaceAll: true });
    expect(router.routes().map((r) => r.path)).toEqual(['/c', '/screens/:screenId']);
  });
});
