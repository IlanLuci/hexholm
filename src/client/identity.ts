/** A stable, unguessable per-browser player id — our lightweight "account". */
export function getPlayerId(): string {
  let id = localStorage.getItem("hexholm:pid");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("hexholm:pid", id);
  }
  return id;
}
