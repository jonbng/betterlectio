enum States { okay, loading, error }

class StatePattern<T> {
  T state;
  final Error? error;
  States status;

  StatePattern(this.state, this.status, {this.error});

  StatePattern<T> loading() {
    return this..status = States.loading;
  }

  StatePattern<T> finish(T state) {
    return StatePattern<T>(state, States.okay);
  }
}
