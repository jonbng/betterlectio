import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';
import 'package:lectio_wrapper/types/terms/term.dart';

class TermBloc extends Cubit<List<Term>?> {
  final Student student;
  TermBloc(this.student) : super(null) {
    _load();
  }

  _load() async {
    var terms = await student.terms.list();
    emit(terms);
  }

  Future<void> set(Term term) async {
    await student.terms.set(term);
    await _load();
  }
}
