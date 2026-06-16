import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';

const finalPeopleProgress = 4;

class PeopleState {
  List<Student> people;
  int progress;
  PeopleState(this.progress, this.people);
}

class PeopleBloc extends Cubit<PeopleState> {
  final Student student;
  PeopleBloc(this.student) : super(PeopleState(0, []));

  void load() {
    student.students.list().listen((event) {
      emit(PeopleState(state.progress + 1, [...event, ...state.people]));
    });
  }
}
