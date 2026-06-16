import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';

import '../../utils/state_pattern.dart';

class StudentCubit<T> extends Cubit<StatePattern<T?>> {
  final Student student;
  final Future<T> Function(Student student)? selector;
  StudentCubit({required this.student, this.selector})
      : super(StatePattern(null, States.loading)) {
    load();
  }

  Future<void> load() async {
    if (selector != null) {
      var list = await selector!(student).timeout(const Duration(seconds: 20));
      emit(StatePattern(list, States.okay));
    }
  }

  Future<void> refresh() async {
    emit(StatePattern(null, States.loading));
    load();
  }

  @override
  void onError(Object error, StackTrace stackTrace) {
    emit(StatePattern(state.state, States.error));
    super.onError(error, stackTrace);
  }
}
